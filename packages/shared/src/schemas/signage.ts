import { z } from 'zod';

// `GET /api/signage/playlist`
export const signagePlaylistItemSchema = z.object({
  videoId: z.string(),
  title: z.string().optional(),
});

export const signagePlaylistResponseSchema = z.object({
  items: z.array(signagePlaylistItemSchema),
  // 次回取得推奨時刻（ISO 8601 UTC）。クライアントのポーリング間隔ヒント＝キャッシュ満了時刻。
  refreshAt: z.string(),
});

export type SignagePlaylistItem = z.infer<typeof signagePlaylistItemSchema>;
export type SignagePlaylistResponse = z.infer<typeof signagePlaylistResponseSchema>;
