import type * as schema from '@tecnova/db';
import { events, mentors, participants, sessions } from '@tecnova/db';
import type {
  CreateMentorRequest,
  MentorItem,
  MentorsListResponse,
  ParticipantsListQuery,
  ParticipantsListResponse,
  TodaySessionsResponse,
  UpdateMentorRequest,
} from '@tecnova/shared/schemas';
import { asc, count, desc, eq, like, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

type Db = DrizzleD1Database<typeof schema>;

export type MentorErrorCode = 'EMAIL_ALREADY_EXISTS' | 'NOT_FOUND';

export class MentorError extends Error {
  constructor(
    public code: MentorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MentorError';
  }
}

// JST 基準で「今日」の日付文字列 'YYYY-MM-DD' を返す。
// events.date は JST の開催日として保存しているため、ここも JST で判定する。
const todayInJst = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

export const fetchTodaySessions = async (db: Db): Promise<TodaySessionsResponse> => {
  const date = todayInJst();
  const [event] = await db.select().from(events).where(eq(events.date, date)).limit(1);

  if (!event) {
    return {
      event: null,
      sessions: [],
      summary: { totalCheckedIn: 0, currentlyPresent: 0, checkedOut: 0 },
    };
  }

  const rows = await db
    .select({
      sessionId: sessions.id,
      participantId: sessions.participantId,
      fullName: participants.fullName,
      nickname: participants.nickname,
      grade: participants.grade,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(eq(sessions.eventId, event.id))
    .orderBy(desc(sessions.checkedInAt));

  const items = rows.map((r) => ({
    sessionId: r.sessionId,
    participantId: r.participantId,
    fullName: r.fullName,
    nickname: r.nickname,
    grade: r.grade,
    checkedInAt: r.checkedInAt.toISOString(),
    checkedOutAt: r.checkedOutAt ? r.checkedOutAt.toISOString() : null,
    isPresent: r.checkedOutAt === null,
  }));

  const currentlyPresent = items.filter((i) => i.isPresent).length;
  return {
    event: { id: event.id, date: event.date },
    sessions: items,
    summary: {
      totalCheckedIn: items.length,
      currentlyPresent,
      checkedOut: items.length - currentlyPresent,
    },
  };
};

export const fetchParticipantsList = async (
  db: Db,
  query: ParticipantsListQuery,
): Promise<ParticipantsListResponse> => {
  const { page, limit, search } = query;
  // ニックネーム / 氏名 のいずれかに部分一致。SQLite LIKE はデフォルトで大小文字無視（ASCII のみ）。
  // 利用者は日本語想定なのでケース感度は実質影響しない。
  const where = search
    ? or(like(participants.nickname, `%${search}%`), like(participants.fullName, `%${search}%`))
    : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(participants)
    .where(where ?? undefined);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      id: participants.id,
      fullName: participants.fullName,
      nickname: participants.nickname,
      grade: participants.grade,
      activatedAt: participants.activatedAt,
      active: participants.active,
    })
    .from(participants)
    .where(where ?? undefined)
    .orderBy(desc(participants.activatedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    participants: rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      nickname: r.nickname,
      grade: r.grade,
      activatedAt: r.activatedAt.toISOString(),
      active: r.active,
    })),
    pagination: { page, limit, total },
  };
};

const toMentorItem = (row: {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'mentor';
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}): MentorItem => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
});

const mentorColumns = {
  id: mentors.id,
  email: mentors.email,
  name: mentors.name,
  role: mentors.role,
  active: mentors.active,
  createdAt: mentors.createdAt,
  lastLoginAt: mentors.lastLoginAt,
} as const;

export const fetchMentorsList = async (db: Db): Promise<MentorsListResponse> => {
  const rows = await db.select(mentorColumns).from(mentors).orderBy(asc(mentors.createdAt));
  return { mentors: rows.map(toMentorItem) };
};

export const createMentor = async (db: Db, input: CreateMentorRequest): Promise<MentorItem> => {
  // email は UNIQUE。先にチェックして 409 を返す（ON CONFLICT に頼らないのは
  // 失敗時に分かりやすいエラーコードを返すため）。
  const [existing] = await db
    .select({ id: mentors.id })
    .from(mentors)
    .where(eq(mentors.email, input.email))
    .limit(1);
  if (existing) {
    throw new MentorError('EMAIL_ALREADY_EXISTS', `email already registered: ${input.email}`);
  }

  const [row] = await db
    .insert(mentors)
    .values({ email: input.email, name: input.name, role: input.role })
    .returning(mentorColumns);
  if (!row) {
    throw new Error('failed to insert mentor');
  }
  return toMentorItem(row);
};

export const updateMentor = async (
  db: Db,
  id: string,
  input: UpdateMentorRequest,
): Promise<MentorItem> => {
  // 部分更新。Zod 側で「1項目以上」を保証しているので、ここでは undefined を弾くだけ。
  const patch: Partial<typeof mentors.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.role !== undefined) patch.role = input.role;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db
    .update(mentors)
    .set(patch)
    .where(eq(mentors.id, id))
    .returning(mentorColumns);
  if (!row) {
    throw new MentorError('NOT_FOUND', `mentor not found: ${id}`);
  }
  return toMentorItem(row);
};
