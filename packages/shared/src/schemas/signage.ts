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

// `GET /api/signage/previous-summary` — 前回開催日の来場・滞在データ（PII なし）。
export const signagePreviousSummarySchema = z.object({
  previous: z
    .object({
      date: z.string(), // 'YYYY-MM-DD'（JST）
      participantCount: z.number(),
      averageStayMinutes: z.number().nullable(), // 退館済みが無ければ null
    })
    .nullable(), // 前回開催が無ければ null
});
export type SignagePreviousSummaryResponse = z.infer<typeof signagePreviousSummarySchema>;

// `GET /api/signage/health` — 基盤システムの稼働確認（DB 到達性）。
export const signageHealthSchema = z.object({
  status: z.literal('ok'),
  time: z.string(), // ISO 8601 UTC
});
export type SignageHealthResponse = z.infer<typeof signageHealthSchema>;
