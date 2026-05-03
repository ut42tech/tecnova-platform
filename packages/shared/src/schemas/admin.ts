import { z } from 'zod';

// `/api/sessions/today`
export const todaySessionItemSchema = z.object({
  sessionId: z.string(),
  participantId: z.string(),
  nickname: z.string(),
  grade: z.string(),
  checkedInAt: z.string(), // ISO 8601 (UTC)
  checkedOutAt: z.string().nullable(),
  isPresent: z.boolean(),
});

export const todaySessionsResponseSchema = z.object({
  // 当日の event がまだ存在しない場合（誰もチェックインしていない）は null
  event: z
    .object({
      id: z.string(),
      date: z.string(), // 'YYYY-MM-DD' (JST)
    })
    .nullable(),
  sessions: z.array(todaySessionItemSchema),
  summary: z.object({
    totalCheckedIn: z.number().int().nonnegative(),
    currentlyPresent: z.number().int().nonnegative(),
    checkedOut: z.number().int().nonnegative(),
  }),
});

// `/api/participants`
export const participantsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  search: z.string().trim().min(1).optional(),
});

export const participantListItemSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  grade: z.string(),
  activatedAt: z.string(), // ISO 8601 (UTC)
  active: z.boolean(),
});

export const participantsListResponseSchema = z.object({
  participants: z.array(participantListItemSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export type TodaySessionItem = z.infer<typeof todaySessionItemSchema>;
export type TodaySessionsResponse = z.infer<typeof todaySessionsResponseSchema>;
export type ParticipantsListQuery = z.infer<typeof participantsListQuerySchema>;
export type ParticipantListItem = z.infer<typeof participantListItemSchema>;
export type ParticipantsListResponse = z.infer<typeof participantsListResponseSchema>;
