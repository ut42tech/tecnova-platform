import { z } from 'zod';

// 内製ID（5桁・年度2桁+連番、例: '26001'）
const participantIdSchema = z.string().regex(/^\d{5}$/);

// `/checkin/pre-registered` のレスポンス
export const preRegisteredParticipantSchema = z.object({
  preRegistrationId: z.string(),
  fullName: z.string(),
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
  fullName: z.string(),
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
  fullName: z.string(),
  nickname: z.string(),
  checkedInAt: z.string(), // ISO 8601
});

// `/checkin/sessions/check-out` のリクエスト/レスポンス
export const checkOutRequestSchema = z.object({
  participantId: participantIdSchema,
});

export const checkOutResponseSchema = z.object({
  fullName: z.string(),
  nickname: z.string(),
  checkedInAt: z.string(),
  checkedOutAt: z.string(),
  stayDurationMinutes: z.number().int().nonnegative(),
});

// `/checkin/history/check-out-bulk` のリクエスト/レスポンス
export const historyBulkCheckOutRequestSchema = z.object({
  participantIds: z.array(participantIdSchema).min(1).max(200),
});

export const historyBulkCheckOutItemSchema = z.object({
  participantId: participantIdSchema,
  fullName: z.string(),
  nickname: z.string(),
  checkedInAt: z.string(), // ISO 8601
  checkedOutAt: z.string(), // ISO 8601
  stayDurationMinutes: z.number().int().nonnegative(),
});

export const historyBulkCheckOutResponseSchema = z.object({
  checkedOutAt: z.string(), // ISO 8601
  checkedOutCount: z.number().int().nonnegative(),
  participants: z.array(historyBulkCheckOutItemSchema),
});

// `/checkin/scan` のリクエスト/レスポンス（action で discriminated union）
export const scanRequestSchema = z.object({
  scanValue: z.string(),
});

// `/checkin/participants/search` のクエリ/レスポンス
// マニュアル入力画面でニックネーム検索に使う。`/api/participants` と違い
// admin 権限不要、ページネーションなし、active=true のみ。
export const participantSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(40),
});

export const participantSearchItemSchema = z.object({
  id: participantIdSchema,
  fullName: z.string(),
  nickname: z.string(),
  grade: z.string(),
});

export const participantSearchResponseSchema = z.object({
  participants: z.array(participantSearchItemSchema),
});

// `/checkin/participants/:participantId` のレスポンス
export const participantProfileResponseSchema = z.object({
  participant: z.object({
    id: participantIdSchema,
    fullName: z.string(),
    nickname: z.string(),
    grade: z.string(),
    activatedAt: z.string(), // ISO 8601
  }),
  stats: z.object({
    visitCount: z.number().int().nonnegative(), // 生のセッション数（後方互換のため維持）
    participationCount: z.number().int().nonnegative(), // 参加回数（ターム単位・30分ルール適用）
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
      // ターム区分。営業時間外の来場は null。venue-schedule の TermId と同期。
      term: z.enum(['morning', 'afternoon', 'evening']).nullable(),
      // 30分ルールを満たし参加回数に数えられるか。
      counted: z.boolean(),
      isPresent: z.boolean(),
    }),
  ),
});

export const scanResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check_in'),
    sessionId: z.string(),
    fullName: z.string(),
    nickname: z.string(),
    checkedInAt: z.string(),
  }),
  z.object({
    action: z.literal('check_out'),
    fullName: z.string(),
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
export type HistoryBulkCheckOutRequest = z.infer<typeof historyBulkCheckOutRequestSchema>;
export type HistoryBulkCheckOutResponse = z.infer<typeof historyBulkCheckOutResponseSchema>;
export type ParticipantProfileResponse = z.infer<typeof participantProfileResponseSchema>;
export type ParticipantSearchQuery = z.infer<typeof participantSearchQuerySchema>;
export type ParticipantSearchItem = z.infer<typeof participantSearchItemSchema>;
export type ParticipantSearchResponse = z.infer<typeof participantSearchResponseSchema>;
export type ScanRequest = z.infer<typeof scanRequestSchema>;
export type ScanResponse = z.infer<typeof scanResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
