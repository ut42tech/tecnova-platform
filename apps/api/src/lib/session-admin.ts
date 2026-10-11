import type * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import type {
  CreateSessionRequest,
  SessionMutationResponse,
  UpdateSessionRequest,
} from '@tecnova/shared/schemas';
import {
  findOverlappingSession,
  SESSION_RULE_MESSAGES,
  type SessionRuleViolation,
  type SessionTimes,
  validateSessionTimes,
} from '@tecnova/shared/session-rules';
import { classifyVisit, toJstDateString } from '@tecnova/shared/venue-schedule';
import { and, eq, ne, type SQL, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

type Db = DrizzleD1Database<typeof schema>;

// 管理画面からの来場記録の追加・編集・削除（admin 専用）。受付の操作ミスを訂正するためのもの。
// DB に制約が無いため、ルールはここと packages/shared/src/session-rules.ts で守る。
// D1 にトランザクションが無いので、開催日の作成・記録の書き込み・空の開催日の削除は 1 回の db.batch にまとめる。
// 設計: docs/superpowers/specs/2026-10-11-checkin-record-correction-design.md

export type SessionErrorCode = 'SESSION_NOT_FOUND' | 'PARTICIPANT_NOT_FOUND' | SessionRuleViolation;

export class SessionError extends Error {
  constructor(
    public code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

const sessionNotFound = () => new SessionError('SESSION_NOT_FOUND', '記録が見つかりません');

// 無効化した子も対象にする（過去の記録を直す場面があるため。受付端末側は従来どおり受け付けない）。
const requireParticipant = async (db: Db, participantId: string): Promise<void> => {
  const [found] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!found) {
    throw new SessionError('PARTICIPANT_NOT_FOUND', `ID ${participantId} の子が見つかりません`);
  }
};

// 同じ子・同じ開催日（JST）の既存記録。編集時は自分自身を除く。
const findSiblingSessions = async (
  db: Db,
  participantId: string,
  date: string,
  excludeSessionId?: string,
): Promise<SessionTimes[]> => {
  const conditions: SQL[] = [eq(sessions.participantId, participantId), eq(events.date, date)];
  if (excludeSessionId !== undefined) conditions.push(ne(sessions.id, excludeSessionId));
  return db
    .select({ checkedInAt: sessions.checkedInAt, checkedOutAt: sessions.checkedOutAt })
    .from(sessions)
    .innerJoin(events, eq(sessions.eventId, events.id))
    .where(and(...conditions));
};

const assertSessionRules = (
  times: SessionTimes,
  siblings: readonly SessionTimes[],
  now: Date,
): void => {
  const violation: SessionRuleViolation | null =
    validateSessionTimes(times, now) ??
    (findOverlappingSession(times, siblings, now) ? 'OVERLAP' : null);
  if (violation) throw new SessionError(violation, SESSION_RULE_MESSAGES[violation]);
};

// 開催日の get-or-create（batch 用の文）。events.date は UNIQUE なので既にあれば何もしない。
const ensureEvent = (db: Db, date: string) =>
  db.insert(events).values({ date }).onConflictDoNothing();

// date の開催日 id。batch 内で ensureEvent の後に評価されるので必ず見つかる。
const eventIdOf = (date: string): SQL<string> =>
  sql<string>`(select ${events.id} from ${events} where ${events.date} = ${date})`;

const parseCheckedOutAt = (value: string | null): Date | null =>
  value === null ? null : new Date(value);

// 記録が 1 件も無くなった過去の開催日を消す（日付の選択肢・サイネージの「前回の開催」に空の日を残さない）。
// 今日の開催日は受付中のチェックインと競合させないため消さない。
const deleteEventIfEmptyPast = (db: Db, eventId: string, today: string) =>
  db
    .delete(events)
    .where(
      and(
        eq(events.id, eventId),
        ne(events.date, today),
        sql`not exists (select 1 from ${sessions} where ${sessions.eventId} = ${eventId})`,
      ),
    );

// PATCH の checkedOutAt は「省略 = 変えない」「null = 滞在中に戻す」を区別する。
const resolveCheckedOutAt = (
  patch: UpdateSessionRequest['checkedOutAt'],
  current: Date | null,
): Date | null => (patch === undefined ? current : parseCheckedOutAt(patch));

// 一覧（GET /api/sessions）と同じ形で返す。ターム・30分ルールは venue-schedule に集約。
const toResponse = async (db: Db, sessionId: string): Promise<SessionMutationResponse> => {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      participantId: sessions.participantId,
      fullName: participants.fullName,
      nickname: participants.nickname,
      grade: participants.grade,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
      eventDate: events.date,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .innerJoin(events, eq(sessions.eventId, events.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) throw sessionNotFound();
  const { term, counted } = classifyVisit(row.checkedInAt);
  return {
    eventDate: row.eventDate,
    session: {
      sessionId: row.sessionId,
      participantId: row.participantId,
      fullName: row.fullName,
      nickname: row.nickname,
      grade: row.grade,
      checkedInAt: row.checkedInAt.toISOString(),
      checkedOutAt: row.checkedOutAt ? row.checkedOutAt.toISOString() : null,
      isPresent: row.checkedOutAt === null,
      term,
      counted,
    },
  };
};

export const createSessionByAdmin = async (
  db: Db,
  input: CreateSessionRequest,
  now: Date,
): Promise<SessionMutationResponse> => {
  await requireParticipant(db, input.participantId);
  const times: SessionTimes = {
    checkedInAt: new Date(input.checkedInAt),
    checkedOutAt: parseCheckedOutAt(input.checkedOutAt),
  };
  // 開催日は入場時刻の JST 日付から決める（集計が「開催日 = 入場日」を前提にしているため）。
  const date = toJstDateString(times.checkedInAt);
  assertSessionRules(times, await findSiblingSessions(db, input.participantId, date), now);

  // 検証を通ってから開催日を作るので、検証エラーで空の開催日は残らない。
  const id = crypto.randomUUID();
  await db.batch([
    ensureEvent(db, date),
    db.insert(sessions).values({
      id,
      participantId: input.participantId,
      eventId: eventIdOf(date),
      checkedInAt: times.checkedInAt,
      checkedOutAt: times.checkedOutAt,
    }),
  ]);
  return toResponse(db, id);
};

export const updateSessionByAdmin = async (
  db: Db,
  sessionId: string,
  patch: UpdateSessionRequest,
  now: Date,
): Promise<SessionMutationResponse> => {
  const [current] = await db
    .select({
      participantId: sessions.participantId,
      eventId: sessions.eventId,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!current) throw sessionNotFound();

  const participantId = patch.participantId ?? current.participantId;
  if (participantId !== current.participantId) await requireParticipant(db, participantId);

  const times: SessionTimes = {
    checkedInAt:
      patch.checkedInAt === undefined ? current.checkedInAt : new Date(patch.checkedInAt),
    checkedOutAt: resolveCheckedOutAt(patch.checkedOutAt, current.checkedOutAt),
  };
  const date = toJstDateString(times.checkedInAt);
  assertSessionRules(times, await findSiblingSessions(db, participantId, date, sessionId), now);

  await db.batch([
    ensureEvent(db, date),
    db
      .update(sessions)
      .set({
        participantId,
        eventId: eventIdOf(date),
        checkedInAt: times.checkedInAt,
        checkedOutAt: times.checkedOutAt,
      })
      .where(eq(sessions.id, sessionId)),
    // 日付が変わって元の開催日が空になった場合だけ消える（同じ日なら NOT EXISTS で何もしない）。
    deleteEventIfEmptyPast(db, current.eventId, toJstDateString(now)),
  ]);
  return toResponse(db, sessionId);
};

export const deleteSessionByAdmin = async (db: Db, sessionId: string, now: Date): Promise<void> => {
  const [current] = await db
    .select({ eventId: sessions.eventId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!current) throw sessionNotFound();
  await db.batch([
    db.delete(sessions).where(eq(sessions.id, sessionId)),
    deleteEventIfEmptyPast(db, current.eventId, toJstDateString(now)),
  ]);
};
