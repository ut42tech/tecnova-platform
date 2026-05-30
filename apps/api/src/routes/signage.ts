import { events } from '@tecnova/db';
import { count } from 'drizzle-orm';
import { Hono } from 'hono';
import { fetchPreviousEventSummary, fetchSignagePlaylist } from '../lib/signage';
import { createDb } from '../middleware/auth';
import type { AppEnv } from '../types';

// サイネージ用エンドポイント。requireAuthenticatedMentor は index.ts で /api/* に適用済み
// なので、ここでは付けない（メンター認証済みの信頼端末からのみ叩かれる）。
export const signageRoute = new Hono<AppEnv>();

// 動画プレイリスト（順序付き videoId 列）。取得失敗（APIキー未設定・YouTube エラー等）は
// throw され apiErrorHandler が 500 化し、クライアントは §5.4 のフォールバック videoId に倒れる。
signageRoute.get('/playlist', async (c) => c.json(await fetchSignagePlaylist(c.env)));

// 前回開催日の来場・滞在データ（集計のみ・PII なし）。
signageRoute.get('/previous-summary', async (c) =>
  c.json(await fetchPreviousEventSummary(createDb(c.env))),
);

// 基盤システムの稼働確認。軽量な DB 到達クエリを1本投げ、成功なら ok を返す
// （失敗時は apiErrorHandler が 500 化し、サイネージ側で「障害」表示に倒れる）。
// /health（公開・root マウント）は CORS 対象外で別オリジンのサイネージから叩けないため、
// CORS 済みの /api 配下に置く。
signageRoute.get('/health', async (c) => {
  const db = createDb(c.env);
  // count() は1行に畳まれるので limit は不要。到達できれば ok。
  await db.select({ n: count() }).from(events);
  return c.json({ status: 'ok', time: new Date().toISOString() });
});
