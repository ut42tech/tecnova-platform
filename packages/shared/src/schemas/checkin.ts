import { z } from 'zod';

// `/checkin/pre-registered` のレスポンス
export const preRegisteredParticipantSchema = z.object({
  preRegistrationId: z.string(),
  nickname: z.string(),
  grade: z.string(),
  registeredAt: z.string(), // 'YYYY-MM-DD'
});

export const preRegisteredListResponseSchema = z.object({
  participants: z.array(preRegisteredParticipantSchema),
});

// `/checkin/activate` のリクエスト/レスポンス
export const activateRequestSchema = z.object({
  preRegistrationId: z.string().min(1),
});

export const activateResponseSchema = z.object({
  participantId: z.string(),
  nickname: z.string(),
  grade: z.string(),
  checkedInAt: z.string(), // ISO 8601
});

// 共通エラーレスポンス
export const errorResponseSchema = z.object({
  error: z.enum(['NOT_FOUND', 'ALREADY_ACTIVATED', 'SHEETS_WRITE_FAILED', 'INTERNAL']),
  message: z.string(),
});

export type PreRegisteredParticipant = z.infer<typeof preRegisteredParticipantSchema>;
export type PreRegisteredListResponse = z.infer<typeof preRegisteredListResponseSchema>;
export type ActivateRequest = z.infer<typeof activateRequestSchema>;
export type ActivateResponse = z.infer<typeof activateResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
