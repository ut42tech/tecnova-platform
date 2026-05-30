import { Hono } from 'hono';
import { fetchSignagePlaylist } from '../lib/signage';
import type { AppEnv } from '../types';

// サイネージ用エンドポイント。requireAuthenticatedMentor は index.ts で /api/* に適用済み
// なので、ここでは付けない（メンター認証済みの信頼端末からのみ叩かれる）。
export const signageRoute = new Hono<AppEnv>();

// 動画プレイリスト（順序付き videoId 列）。取得失敗（APIキー未設定・YouTube エラー等）は
// throw され apiErrorHandler が 500 化し、クライアントは §5.4 のフォールバック videoId に倒れる。
signageRoute.get('/playlist', async (c) => c.json(await fetchSignagePlaylist(c.env)));
