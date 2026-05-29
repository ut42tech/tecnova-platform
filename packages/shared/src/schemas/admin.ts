import { z } from 'zod';

// `/api/sessions/today`
export const todaySessionItemSchema = z.object({
  sessionId: z.string(),
  participantId: z.string(),
  fullName: z.string(),
  nickname: z.string(),
  grade: z.string(),
  checkedInAt: z.string(), // ISO 8601 (UTC)
  checkedOutAt: z.string().nullable(),
  isPresent: z.boolean(),
  // ターム区分は backend が checkedInAt（JST 壁時計）から導出する。営業時間外は null。
  // 重要な区分判定ロジックをフロントに持たせないため、venue-schedule の結果を API で返す。
  term: z.enum(['morning', 'afternoon', 'evening']).nullable(),
  // 30分ルールを満たし参加回数に数えられるか（タームの残り30分以上前の来場か）。
  counted: z.boolean(),
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

// `/api/sessions?date=YYYY-MM-DD`
// date を省略すれば「今日」（JST）として解決する。レスポンスは
// todaySessionsResponseSchema と同一形のため別エイリアスを置かない。
export const sessionsByDateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required')
    .optional(),
});

// `/api/events`
// ダッシュボードの日付切替セレクタが対象とする「過去にチェックインがあった日」を返す。
// 開催日降順で、limit はデフォルト 50（直近 50 開催ぶん）。
export const eventItemSchema = z.object({
  id: z.string(),
  date: z.string(), // 'YYYY-MM-DD' (JST)
});
export const eventsListResponseSchema = z.object({
  events: z.array(eventItemSchema),
});

// `/api/stats/participation`
// 会場全体の参加回数集計（ターム別・日別）。from/to で期間を絞れる（いずれも JST・含む）。
// counted 判定は SQL で表現できないため backend が JS 集計する（requirements.md §5.4 / mvp.md §4.4）。
export const participationSummaryQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required')
    .optional(),
});

const participationTermBreakdownSchema = z.object({
  morning: z.number().int().nonnegative(),
  afternoon: z.number().int().nonnegative(),
  evening: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const participationSummaryResponseSchema = z.object({
  range: z.object({
    from: z.string().nullable(), // 'YYYY-MM-DD' (JST)
    to: z.string().nullable(),
  }),
  totals: participationTermBreakdownSchema.extend({
    days: z.number().int().nonnegative(), // 集計対象の開催日数
  }),
  byDate: z.array(
    participationTermBreakdownSchema.extend({
      date: z.string(), // 'YYYY-MM-DD' (JST)
    }),
  ),
});

// `/api/participants`
// 検索（ID / 氏名 / ニックネーム部分一致）+ 学年 + 有効/無効 のフィルタを受け付ける。
// active は文字列で受けるが、'true' / 'false' のみ許容する。Zod の coerce は
// 'false' を truthy として扱ってしまうため、preprocess で明示変換する。
export const participantsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  search: z.string().trim().min(1).optional(),
  grade: z.string().trim().min(1).optional(),
  active: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (v === 'true') return true;
      if (v === 'false') return false;
      return v;
    }, z.boolean().optional())
    .optional(),
});

export const participantListItemSchema = z.object({
  id: z.string(),
  fullName: z.string(),
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

// 受付対象学年（小1〜高3 + その他）。フロントのプルダウンと backend のバリデーションで
// 同じソースを使うため shared から export する。出力スキーマ側は過去データとの
// 後方互換のため `z.string()` のままにし、入力（create）でのみ enum を強制する。
export const GRADES = [
  '小1',
  '小2',
  '小3',
  '小4',
  '小5',
  '小6',
  '中1',
  '中2',
  '中3',
  '高1',
  '高2',
  '高3',
  'その他',
] as const;
export type Grade = (typeof GRADES)[number];
export const gradeSchema = z.enum(GRADES);

// `/api/pre-registrations`（admin role 専用）
// 学生側スプシの未アクティベート行を Source of Truth とする。
// shape は checkin 側 `preRegisteredParticipantSchema` と同一だが、admin 名前空間で
// 独立の契約として保ち、将来表示項目を増やす余地を残す。
export const preRegistrationItemSchema = z.object({
  preRegistrationId: z.string(),
  fullName: z.string(),
  nickname: z.string(),
  grade: z.string(),
  registeredAt: z.string(), // 'YYYY-MM-DD' (JST)
});

export const activatedPreRegistrationItemSchema = preRegistrationItemSchema.extend({
  internalId: z.string(),
  activatedAt: z.string(),
});

export const preRegistrationsListResponseSchema = z.object({
  preRegistrations: z.array(preRegistrationItemSchema),
  activatedPreRegistrations: z.array(activatedPreRegistrationItemSchema),
});

// preRegistrationId は backend が `PRE-{year}-{NNNN}` で自動採番するため、
// リクエストには含めない（fool proof: admin の手入力ミスを防ぐ）。
// grade は GRADES の enum で弾く（小1〜高3 + その他 以外を受け付けない）。
export const createPreRegistrationRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  nickname: z.string().trim().min(1).max(40),
  grade: gradeSchema,
  registeredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
});

export type TodaySessionItem = z.infer<typeof todaySessionItemSchema>;
export type TodaySessionsResponse = z.infer<typeof todaySessionsResponseSchema>;
export type SessionsByDateQuery = z.infer<typeof sessionsByDateQuerySchema>;
export type EventItem = z.infer<typeof eventItemSchema>;
export type EventsListResponse = z.infer<typeof eventsListResponseSchema>;
export type ParticipationSummaryQuery = z.infer<typeof participationSummaryQuerySchema>;
export type ParticipationSummaryResponse = z.infer<typeof participationSummaryResponseSchema>;
export type ParticipantsListQuery = z.infer<typeof participantsListQuerySchema>;
export type ParticipantListItem = z.infer<typeof participantListItemSchema>;
export type ParticipantsListResponse = z.infer<typeof participantsListResponseSchema>;
export type MentorItem = z.infer<typeof mentorItemSchema>;
export type MentorsListResponse = z.infer<typeof mentorsListResponseSchema>;
export type CreateMentorRequest = z.infer<typeof createMentorRequestSchema>;
export type UpdateMentorRequest = z.infer<typeof updateMentorRequestSchema>;
export type PreRegistrationItem = z.infer<typeof preRegistrationItemSchema>;
export type ActivatedPreRegistrationItem = z.infer<typeof activatedPreRegistrationItemSchema>;
export type PreRegistrationsListResponse = z.infer<typeof preRegistrationsListResponseSchema>;
export type CreatePreRegistrationRequest = z.infer<typeof createPreRegistrationRequestSchema>;
