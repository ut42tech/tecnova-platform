import { z } from 'zod';

// 内製ID（5桁・年度2桁+連番、例: '26001'）
const participantIdSchema = z.string().regex(/^\d{5}$/);

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

// `/checkin/sessions/check-in` のリクエスト/レスポンス
export const checkInRequestSchema = z.object({
  participantId: participantIdSchema,
});

export const checkInResponseSchema = z.object({
  sessionId: z.string(),
  nickname: z.string(),
  checkedInAt: z.string(), // ISO 8601
});

// `/checkin/sessions/check-out` のリクエスト/レスポンス
export const checkOutRequestSchema = z.object({
  participantId: participantIdSchema,
});

export const checkOutResponseSchema = z.object({
  nickname: z.string(),
  checkedInAt: z.string(),
  checkedOutAt: z.string(),
  stayDurationMinutes: z.number().int().nonnegative(),
});

// `/checkin/scan` のリクエスト/レスポンス（action で discriminated union）
export const scanRequestSchema = z.object({
  scanValue: z.string(),
});

// `/checkin/participants/:participantId` のレスポンス
export const participantProfileResponseSchema = z.object({
  participant: z.object({
    id: participantIdSchema,
    nickname: z.string(),
    grade: z.string(),
    activatedAt: z.string(), // ISO 8601
  }),
  stats: z.object({
    visitCount: z.number().int().nonnegative(),
    lastVisitedAt: z.string().nullable(), // ISO 8601
    totalStayDurationMinutes: z.number().int().nonnegative(),
  }),
  current: z.object({
    isPresent: z.boolean(),
    checkedInAt: z.string().nullable(), // ISO 8601
    nextAction: z.enum(['check_in', 'check_out']),
  }),
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      checkedInAt: z.string(), // ISO 8601
      checkedOutAt: z.string().nullable(), // ISO 8601
      stayDurationMinutes: z.number().int().nonnegative().nullable(),
      isPresent: z.boolean(),
    }),
  ),
});

export const scanResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check_in'),
    sessionId: z.string(),
    nickname: z.string(),
    checkedInAt: z.string(),
  }),
  z.object({
    action: z.literal('check_out'),
    nickname: z.string(),
    checkedInAt: z.string(),
    checkedOutAt: z.string(),
    stayDurationMinutes: z.number().int().nonnegative(),
  }),
]);

// 共通エラーレスポンス
export const errorResponseSchema = z.object({
  error: z.enum([
    'NOT_FOUND',
    'ALREADY_ACTIVATED',
    'ALREADY_CHECKED_IN',
    'NOT_CHECKED_IN',
    'INVALID_SCAN_VALUE',
    'SHEETS_WRITE_FAILED',
    'INTERNAL',
  ]),
  message: z.string(),
});

export type PreRegisteredParticipant = z.infer<typeof preRegisteredParticipantSchema>;
export type PreRegisteredListResponse = z.infer<typeof preRegisteredListResponseSchema>;
export type ActivateRequest = z.infer<typeof activateRequestSchema>;
export type ActivateResponse = z.infer<typeof activateResponseSchema>;
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;
export type CheckInResponse = z.infer<typeof checkInResponseSchema>;
export type CheckOutRequest = z.infer<typeof checkOutRequestSchema>;
export type CheckOutResponse = z.infer<typeof checkOutResponseSchema>;
export type ParticipantProfileResponse = z.infer<typeof participantProfileResponseSchema>;
export type ScanRequest = z.infer<typeof scanRequestSchema>;
export type ScanResponse = z.infer<typeof scanResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
