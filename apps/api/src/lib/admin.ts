import type * as schema from '@tecnova/db';
import { events, mentors, participants, sessions } from '@tecnova/db';
import type {
  CreateMentorRequest,
  EventsListResponse,
  MentorItem,
  MentorsListResponse,
  ParticipantsListQuery,
  ParticipantsListResponse,
  ParticipationSummaryQuery,
  ParticipationSummaryResponse,
  TodaySessionsResponse,
  UpdateMentorRequest,
} from '@tecnova/shared/schemas';
import {
  classifyVisit,
  participationKey,
  type TermId,
  toJstDateString,
} from '@tecnova/shared/venue-schedule';
import { and, asc, count, desc, eq, gte, like, lte, or, type SQL } from 'drizzle-orm';
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
const todayInJst = (): string => toJstDateString(new Date());

// 指定日（YYYY-MM-DD, JST）の event とそのセッション一覧を返す。
// date が null の場合は「今日（JST）」として解決する。
// 対象 event がまだ存在しない（誰もチェックインしていない / 開催前）の場合は
// event=null と空配列を返す。
export const fetchSessionsForEvent = async (
  db: Db,
  date: string | null,
): Promise<TodaySessionsResponse> => {
  const targetDate = date ?? todayInJst();
  const [event] = await db.select().from(events).where(eq(events.date, targetDate)).limit(1);

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

  const items = rows.map((r) => {
    // ターム判定・30分ルールは venue-schedule に集約。フロントへは確定値だけ渡す。
    const { term, counted } = classifyVisit(r.checkedInAt);
    return {
      sessionId: r.sessionId,
      participantId: r.participantId,
      fullName: r.fullName,
      nickname: r.nickname,
      grade: r.grade,
      checkedInAt: r.checkedInAt.toISOString(),
      checkedOutAt: r.checkedOutAt ? r.checkedOutAt.toISOString() : null,
      isPresent: r.checkedOutAt === null,
      term,
      counted,
    };
  });

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

// 後方互換のエイリアス。新規実装は fetchSessionsForEvent を使う。
export const fetchTodaySessions = (db: Db): Promise<TodaySessionsResponse> =>
  fetchSessionsForEvent(db, null);

// 過去開催日のセレクタ用。events を date 降順で最新 limit 件返す。
export const fetchEventsList = async (db: Db, limit = 50): Promise<EventsListResponse> => {
  const rows = await db
    .select({ id: events.id, date: events.date })
    .from(events)
    .orderBy(desc(events.date))
    .limit(limit);
  return { events: rows };
};

// 1 ターム分のカウント集計バケット。byDate の各要素と totals の共通形。
type TermBuckets = { morning: number; afternoon: number; evening: number; total: number };

const emptyBuckets = (): TermBuckets => ({ morning: 0, afternoon: 0, evening: 0, total: 0 });

const incrementBuckets = (buckets: TermBuckets, term: TermId): void => {
  buckets[term] += 1;
  buckets.total += 1;
};

// 会場全体の参加回数集計（ターム別・日別）。from/to は events.date（'YYYY-MM-DD' JST）で絞る。
// 「カウント対象」の判定（ターム内 かつ ターム終了の30分以上前）は SQL で表現できないため、
// 候補セッションを取得して JS で集計する（会場のデータ量は小規模 = 最大でも数千行）。
export const fetchParticipationSummary = async (
  db: Db,
  query: ParticipationSummaryQuery,
): Promise<ParticipationSummaryResponse> => {
  // events.date は TEXT 'YYYY-MM-DD'。ISO 日付は辞書順比較で日付順と一致するため gte/lte で範囲指定できる。
  const conditions: SQL[] = [];
  if (query.from) conditions.push(gte(events.date, query.from));
  if (query.to) conditions.push(lte(events.date, query.to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // active フィルタは掛けない（全セッションを数える = 管理画面のセッション一覧と同じ方針）。
  const rows = await db
    .select({
      participantId: sessions.participantId,
      eventDate: events.date,
      checkedInAt: sessions.checkedInAt,
    })
    .from(sessions)
    .innerJoin(events, eq(sessions.eventId, events.id))
    .where(where);

  // 同一参加者の「日付 + ターム」は1回だけ数える。dedup キー(`date#term#participantId`)で
  // 重複を弾きつつ、その場で日別・全体バケットへ加算する（キー文字列を再パースしない）。
  const seen = new Set<string>();
  const byDateMap = new Map<string, TermBuckets>();
  const totals = emptyBuckets();
  for (const row of rows) {
    const { term, counted } = classifyVisit(row.checkedInAt);
    if (term === null || !counted) continue;
    const dedupKey = `${participationKey(row.eventDate, term)}#${row.participantId}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    let buckets = byDateMap.get(row.eventDate);
    if (!buckets) {
      buckets = emptyBuckets();
      byDateMap.set(row.eventDate, buckets);
    }
    incrementBuckets(buckets, term);
    incrementBuckets(totals, term);
  }

  const byDate = [...byDateMap.entries()]
    .map(([date, buckets]) => ({ date, ...buckets }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    range: { from: query.from ?? null, to: query.to ?? null },
    totals: { ...totals, days: byDate.length },
    byDate,
  };
};

export const fetchParticipantsList = async (
  db: Db,
  query: ParticipantsListQuery,
): Promise<ParticipantsListResponse> => {
  const { page, limit, search, grade, active } = query;
  // ID / 氏名 / ニックネームのいずれかに部分一致。SQLite LIKE はデフォルトで大小文字無視（ASCII のみ）。
  // 利用者は日本語想定なのでケース感度は実質影響しない。
  const conditions: SQL[] = [];
  if (search) {
    const c = or(
      like(participants.id, `%${search}%`),
      like(participants.nickname, `%${search}%`),
      like(participants.fullName, `%${search}%`),
    );
    if (c) conditions.push(c);
  }
  if (grade) conditions.push(eq(participants.grade, grade));
  if (active !== undefined) conditions.push(eq(participants.active, active));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(participants).where(where);
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
    .where(where)
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
