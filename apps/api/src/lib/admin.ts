import type * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import type {
  ParticipantsListQuery,
  ParticipantsListResponse,
  TodaySessionsResponse,
} from '@tecnova/shared/schemas';
import { count, desc, eq, like } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

type Db = DrizzleD1Database<typeof schema>;

// JST 基準で「今日」の日付文字列 'YYYY-MM-DD' を返す。
// events.date は JST の開催日として保存しているため、ここも JST で判定する。
const todayInJst = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

export const fetchTodaySessions = async (db: Db): Promise<TodaySessionsResponse> => {
  const date = todayInJst();
  const [event] = await db.select().from(events).where(eq(events.date, date)).limit(1);

  if (!event) {
    return {
      event: null,
      sessions: [],
      summary: { totalCheckedIn: 0, currentlyPresent: 0, checkedOut: 0 },
    };
  }

  const rows = await db
    .select({
      sessionId: sessions.id,
      participantId: sessions.participantId,
      nickname: participants.nickname,
      grade: participants.grade,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(eq(sessions.eventId, event.id))
    .orderBy(desc(sessions.checkedInAt));

  const items = rows.map((r) => ({
    sessionId: r.sessionId,
    participantId: r.participantId,
    nickname: r.nickname,
    grade: r.grade,
    checkedInAt: r.checkedInAt.toISOString(),
    checkedOutAt: r.checkedOutAt ? r.checkedOutAt.toISOString() : null,
    isPresent: r.checkedOutAt === null,
  }));

  const currentlyPresent = items.filter((i) => i.isPresent).length;
  return {
    event: { id: event.id, date: event.date },
    sessions: items,
    summary: {
      totalCheckedIn: items.length,
      currentlyPresent,
      checkedOut: items.length - currentlyPresent,
    },
  };
};

export const fetchParticipantsList = async (
  db: Db,
  query: ParticipantsListQuery,
): Promise<ParticipantsListResponse> => {
  const { page, limit, search } = query;
  // ニックネーム部分一致。SQLite LIKE はデフォルトで大小文字無視（ASCII のみ）。
  // 利用者は日本語想定なのでケース感度は実質影響しない。
  const where = search ? like(participants.nickname, `%${search}%`) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(participants)
    .where(where ?? undefined);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      id: participants.id,
      nickname: participants.nickname,
      grade: participants.grade,
      activatedAt: participants.activatedAt,
      active: participants.active,
    })
    .from(participants)
    .where(where ?? undefined)
    .orderBy(desc(participants.activatedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    participants: rows.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      grade: r.grade,
      activatedAt: r.activatedAt.toISOString(),
      active: r.active,
    })),
    pagination: { page, limit, total },
  };
};
