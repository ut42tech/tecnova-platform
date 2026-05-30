import type * as schema from '@tecnova/db';
import { events, sessions } from '@tecnova/db';
import type {
  SignagePlaylistResponse,
  SignagePreviousSummaryResponse,
} from '@tecnova/shared/schemas';
import { toJstDateString } from '@tecnova/shared/venue-schedule';
import { summarizeStays } from '@tecnova/shared/visit-summary';
import { fetchPlaylistVideos, type YouTubePlaylistVideo } from '@tecnova/shared/youtube';
import { desc, eq, lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { Bindings } from '../types';

type Db = DrizzleD1Database<typeof schema>;

// プレイリストはサーバ側で数分キャッシュする。Data API のクォータ節約と、プレイリスト
// 更新の反映遅延（数分）は許容（spec §5.1）。Workers がリサイクルされたら自然に再取得。
const CACHE_TTL_MS = 5 * 60_000;

let cache: { items: YouTubePlaylistVideo[]; expiresAt: number } | null = null;

export const fetchSignagePlaylist = async (env: Bindings): Promise<SignagePlaylistResponse> => {
  const now = Date.now();
  if (!cache || cache.expiresAt <= now) {
    const items = await fetchPlaylistVideos(env.YOUTUBE_API_KEY, env.YOUTUBE_PLAYLIST_ID);
    cache = { items, expiresAt: now + CACHE_TTL_MS };
  }
  return { items: cache.items, refreshAt: new Date(cache.expiresAt).toISOString() };
};

// 前回開催日（JST の今日より前で最新の event）の来場・滞在データを集計して返す。
// events.date は TEXT 'YYYY-MM-DD' なので辞書順比較＝日付順で「今日より前の最新」を取れる。
// 返すのは集計値のみ（PII なし）。前回開催が無ければ previous=null。
export const fetchPreviousEventSummary = async (
  db: Db,
): Promise<SignagePreviousSummaryResponse> => {
  const today = toJstDateString(new Date());
  const [event] = await db
    .select({ id: events.id, date: events.date })
    .from(events)
    .where(lt(events.date, today))
    .orderBy(desc(events.date))
    .limit(1);
  if (!event) return { previous: null };

  const rows = await db
    .select({
      participantId: sessions.participantId,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .where(eq(sessions.eventId, event.id));

  // 退館→再入館で同一人物が複数行になるため、participantId を渡してユニーク人数で集計する。
  const summary = summarizeStays(
    rows.map((r) => ({
      participantId: r.participantId,
      checkedInAt: r.checkedInAt.getTime(),
      checkedOutAt: r.checkedOutAt ? r.checkedOutAt.getTime() : null,
    })),
  );
  return {
    previous: {
      date: event.date,
      participantCount: summary.count,
      averageStayMinutes: summary.averageStayMinutes,
    },
  };
};
