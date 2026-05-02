import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// 参加者マスタ
// id は西暦下2桁＋連番（例: '26001'）。来場順採番のため、SELECT で直近IDを取得して計算する。
export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  preRegistrationId: text('pre_registration_id').unique().notNull(),
  nickname: text('nickname').notNull(),
  grade: text('grade').notNull(),
  // タイムスタンプは UTC の Unix epoch ms で保存し、表示時に JST 変換する
  activatedAt: integer('activated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  active: integer('active', { mode: 'boolean' }).default(true).notNull(),
});

// 開催日マスタ
// チェックイン時にその日のレコードがなければ ON CONFLICT DO NOTHING で自動生成される
export const events = sqliteTable('events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  date: text('date').unique().notNull(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// 来場セッション
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    participantId: text('participant_id')
      .references(() => participants.id)
      .notNull(),
    eventId: text('event_id')
      .references(() => events.id)
      .notNull(),
    checkedInAt: integer('checked_in_at', { mode: 'timestamp_ms' })
      .$defaultFn(() => new Date())
      .notNull(),
    checkedOutAt: integer('checked_out_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('idx_sessions_participant_event').on(t.participantId, t.eventId),
    index('idx_sessions_event_checkedin').on(t.eventId, t.checkedInAt),
  ],
);

// メンター（運営者）
// email は OAuth 許可リストの判定キー。個人 Gmail を許容する
export const mentors = sqliteTable('mentors', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'mentor'] })
    .default('mentor')
    .notNull(),
  active: integer('active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});
