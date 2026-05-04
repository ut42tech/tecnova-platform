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

// `/api/mentors`（admin role 専用）
const mentorRoleSchema = z.enum(['admin', 'mentor']);

export const mentorItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: mentorRoleSchema,
  active: z.boolean(),
  createdAt: z.string(), // ISO 8601 (UTC)
  lastLoginAt: z.string().nullable(), // ISO 8601 (UTC)
});

export const mentorsListResponseSchema = z.object({
  mentors: z.array(mentorItemSchema),
});

export const createMentorRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1),
  role: mentorRoleSchema.default('mentor'),
});

// 編集可能項目は name / role / active。email は OAuth 突合キーなので変更不可。
// 1つ以上の項目が含まれていることを必須とする。
export const updateMentorRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: mentorRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.role !== undefined || v.active !== undefined, {
    message: 'at least one of name, role, active is required',
  });

// `/api/pre-registrations`（admin role 専用）
// 学生側スプシの未アクティベート行を Source of Truth とする。
// shape は checkin 側 `preRegisteredParticipantSchema` と同一だが、admin 名前空間で
// 独立の契約として保ち、将来表示項目を増やす余地を残す。
export const preRegistrationItemSchema = z.object({
  preRegistrationId: z.string(),
  nickname: z.string(),
  grade: z.string(),
  registeredAt: z.string(), // 'YYYY-MM-DD' (JST)
});

export const preRegistrationsListResponseSchema = z.object({
  preRegistrations: z.array(preRegistrationItemSchema),
});

// preRegistrationId は backend が `PRE-{year}-{NNNN}` で自動採番するため、
// リクエストには含めない（fool proof: admin の手入力ミスを防ぐ）。
export const createPreRegistrationRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(40),
  grade: z.string().trim().min(1).max(10),
  registeredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
});

export type TodaySessionItem = z.infer<typeof todaySessionItemSchema>;
export type TodaySessionsResponse = z.infer<typeof todaySessionsResponseSchema>;
export type ParticipantsListQuery = z.infer<typeof participantsListQuerySchema>;
export type ParticipantListItem = z.infer<typeof participantListItemSchema>;
export type ParticipantsListResponse = z.infer<typeof participantsListResponseSchema>;
export type MentorItem = z.infer<typeof mentorItemSchema>;
export type MentorsListResponse = z.infer<typeof mentorsListResponseSchema>;
export type CreateMentorRequest = z.infer<typeof createMentorRequestSchema>;
export type UpdateMentorRequest = z.infer<typeof updateMentorRequestSchema>;
export type PreRegistrationItem = z.infer<typeof preRegistrationItemSchema>;
export type PreRegistrationsListResponse = z.infer<typeof preRegistrationsListResponseSchema>;
export type CreatePreRegistrationRequest = z.infer<typeof createPreRegistrationRequestSchema>;
