import type * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import { fetchSheetRows, updateSheetRow } from '@tecnova/shared/google-sheets';
import type { ParticipantSearchItem, TodaySessionsResponse } from '@tecnova/shared/schemas';
import { and, asc, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

type Db = DrizzleD1Database<typeof schema>;

// 学生側スプシのデータレンジ。1行目はヘッダー、2行目以降がデータ。
// admin 側 (pre-registrations.ts) も同じレンジ・列構成を扱うため共有する。
export const SHEET_RANGE = 'participants!A2:G';

export interface PreRegRow {
  rowNumber: number; // 1-indexed sheet row。ヘッダーが1行目なので A2:G を読んだ場合 index 0 → row 2
  preRegistrationId: string;
  nickname: string;
  grade: string;
  registeredAt: string;
  internalId: string;
  activatedAt: string;
  activated: boolean;
}

export const parseSheetRows = (rows: string[][]): PreRegRow[] =>
  rows
    .map((row, i) => ({
      rowNumber: i + 2,
      preRegistrationId: row[0] ?? '',
      nickname: row[1] ?? '',
      grade: row[2] ?? '',
      registeredAt: row[3] ?? '',
      internalId: row[4] ?? '',
      activatedAt: row[5] ?? '',
      activated: (row[6] ?? '').toUpperCase() === 'TRUE',
    }))
    .filter((r) => r.preRegistrationId);

export const fetchPreRegisteredList = async (
  encodedKey: string,
  spreadsheetId: string,
): Promise<Array<Pick<PreRegRow, 'preRegistrationId' | 'nickname' | 'grade' | 'registeredAt'>>> => {
  const raw = await fetchSheetRows(encodedKey, spreadsheetId, SHEET_RANGE);
  return parseSheetRows(raw)
    .filter((r) => !r.activated)
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
    .map(({ preRegistrationId, nickname, grade, registeredAt }) => ({
      preRegistrationId,
      nickname,
      grade,
      registeredAt,
    }));
};

const generateNextParticipantId = async (db: Db): Promise<string> => {
  const yearPrefix = String(new Date().getFullYear() % 100).padStart(2, '0');
  const result = await db
    .select({ id: participants.id })
    .from(participants)
    .where(like(participants.id, `${yearPrefix}%`))
    .orderBy(desc(participants.id))
    .limit(1);

  const last = result[0];
  if (!last) return `${yearPrefix}001`;
  const nextNum = Number.parseInt(last.id.slice(2), 10) + 1;
  return `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
};

const todayJST = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getOrCreateTodayEvent = async (db: Db): Promise<string> => {
  const today = todayJST();
  const [created] = await db
    .insert(events)
    .values({ date: today })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;
  const [existing] = await db.select().from(events).where(eq(events.date, today)).limit(1);
  if (!existing) throw new Error('failed to get-or-create today event');
  return existing.id;
};

const formatActivatedAtForSheet = (date: Date): string => {
  // 学生側スプシのF列フォーマットは 'YYYY-MM-DD HH:mm:ss' (JST基準)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return fmt.format(date).replace(', ', ' ');
};

export type CheckinErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_ACTIVATED'
  | 'ALREADY_CHECKED_IN'
  | 'NOT_CHECKED_IN'
  | 'INVALID_SCAN_VALUE'
  | 'SHEETS_WRITE_FAILED';

export class CheckinError extends Error {
  constructor(
    public readonly code: CheckinErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CheckinError';
  }
}

export interface ActivateInput {
  db: Db;
  encodedKey: string;
  spreadsheetId: string;
  preRegistrationId: string;
}

export interface ActivateOutput {
  participantId: string;
  nickname: string;
  grade: string;
  checkedInAt: Date;
}

// アクティベート処理。D1にはインタラクティブ・トランザクションがないため
// saga パターンで原子性に近い保証を作る:
//   1. シートで対象行を特定
//   2. 採番 → event_id 取得
//   3. db.batch で participants + sessions を原子的に書き込み
//   4. シート E/F/G 列を更新
//   5. シート更新失敗時は db.batch で sessions → participants を補償削除
//
// PK 衝突時のリトライは未実装（同時アクティベートはほぼ起こらない想定）。
// TODO(activate-flow): 採番衝突発生頻度が問題になるなら最大3回リトライ追加
export const activatePreRegistered = async ({
  db,
  encodedKey,
  spreadsheetId,
  preRegistrationId,
}: ActivateInput): Promise<ActivateOutput> => {
  const raw = await fetchSheetRows(encodedKey, spreadsheetId, SHEET_RANGE);
  const target = parseSheetRows(raw).find((r) => r.preRegistrationId === preRegistrationId);
  if (!target) {
    throw new CheckinError('NOT_FOUND', `pre-registration ${preRegistrationId} not found`);
  }
  if (target.activated) {
    throw new CheckinError('ALREADY_ACTIVATED', `${preRegistrationId} is already activated`);
  }

  const newId = await generateNextParticipantId(db);
  const eventId = await getOrCreateTodayEvent(db);
  const checkedInAt = new Date();

  await db.batch([
    db.insert(participants).values({
      id: newId,
      preRegistrationId,
      nickname: target.nickname,
      grade: target.grade,
      activatedAt: checkedInAt,
    }),
    db.insert(sessions).values({
      participantId: newId,
      eventId,
      checkedInAt,
    }),
  ]);

  try {
    const sheetRange = `participants!E${target.rowNumber}:G${target.rowNumber}`;
    await updateSheetRow(encodedKey, spreadsheetId, sheetRange, [
      [newId, formatActivatedAtForSheet(checkedInAt), 'TRUE'],
    ]);
  } catch (e) {
    // 補償処理: sessions の FK 制約により sessions → participants の順で削除する
    try {
      await db.batch([
        db.delete(sessions).where(eq(sessions.participantId, newId)),
        db.delete(participants).where(eq(participants.id, newId)),
      ]);
    } catch (compErr) {
      // 補償自体が失敗 → ゴーストレコードとしてログだけ残し、運用側で手動修復
      console.error(`compensation failed for participant ${newId}:`, compErr);
    }
    throw new CheckinError('SHEETS_WRITE_FAILED', e instanceof Error ? e.message : String(e));
  }

  return {
    participantId: newId,
    nickname: target.nickname,
    grade: target.grade,
    checkedInAt,
  };
};

// ---- 通常チェックイン / チェックアウト / スキャン ----

interface ActiveParticipant {
  id: string;
  nickname: string;
}

const requireActiveParticipant = async (
  db: Db,
  participantId: string,
): Promise<ActiveParticipant> => {
  const [row] = await db
    .select({
      id: participants.id,
      nickname: participants.nickname,
      active: participants.active,
    })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!row?.active) {
    throw new CheckinError('NOT_FOUND', `participant ${participantId} not found or inactive`);
  }
  return { id: row.id, nickname: row.nickname };
};

interface ProfileParticipant {
  id: string;
  nickname: string;
  grade: string;
  activatedAt: Date;
}

const requireProfileParticipant = async (
  db: Db,
  participantId: string,
): Promise<ProfileParticipant> => {
  const [row] = await db
    .select({
      id: participants.id,
      nickname: participants.nickname,
      grade: participants.grade,
      activatedAt: participants.activatedAt,
      active: participants.active,
    })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!row?.active) {
    throw new CheckinError('NOT_FOUND', `participant ${participantId} not found or inactive`);
  }
  return {
    id: row.id,
    nickname: row.nickname,
    grade: row.grade,
    activatedAt: row.activatedAt,
  };
};

const findActiveSessionToday = async (
  db: Db,
  participantId: string,
  eventId: string,
): Promise<{ id: string; checkedInAt: Date } | null> => {
  const [row] = await db
    .select({ id: sessions.id, checkedInAt: sessions.checkedInAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.participantId, participantId),
        eq(sessions.eventId, eventId),
        isNull(sessions.checkedOutAt),
      ),
    )
    .limit(1);
  return row ?? null;
};

export interface CheckInResult {
  sessionId: string;
  nickname: string;
  checkedInAt: Date;
}

export const recordCheckIn = async (db: Db, participantId: string): Promise<CheckInResult> => {
  const participant = await requireActiveParticipant(db, participantId);
  const eventId = await getOrCreateTodayEvent(db);

  const existing = await findActiveSessionToday(db, participantId, eventId);
  if (existing) {
    throw new CheckinError(
      'ALREADY_CHECKED_IN',
      `participant ${participantId} is already checked in`,
    );
  }

  const checkedInAt = new Date();
  const [inserted] = await db
    .insert(sessions)
    .values({ participantId, eventId, checkedInAt })
    .returning({ id: sessions.id });

  if (!inserted) {
    throw new Error('failed to insert session');
  }
  return {
    sessionId: inserted.id,
    nickname: participant.nickname,
    checkedInAt,
  };
};

export interface CheckOutResult {
  nickname: string;
  checkedInAt: Date;
  checkedOutAt: Date;
  stayDurationMinutes: number;
}

export const recordCheckOut = async (db: Db, participantId: string): Promise<CheckOutResult> => {
  const participant = await requireActiveParticipant(db, participantId);
  const eventId = await getOrCreateTodayEvent(db);

  const open = await findActiveSessionToday(db, participantId, eventId);
  if (!open) {
    throw new CheckinError('NOT_CHECKED_IN', `participant ${participantId} has no active session`);
  }

  const checkedOutAt = new Date();
  await db.update(sessions).set({ checkedOutAt }).where(eq(sessions.id, open.id));

  return {
    nickname: participant.nickname,
    checkedInAt: open.checkedInAt,
    checkedOutAt,
    stayDurationMinutes: Math.floor((checkedOutAt.getTime() - open.checkedInAt.getTime()) / 60_000),
  };
};

export interface ParticipantProfile {
  participant: ProfileParticipant;
  stats: {
    visitCount: number;
    lastVisitedAt: Date | null;
    totalStayDurationMinutes: number;
  };
  current: {
    isPresent: boolean;
    checkedInAt: Date | null;
    nextAction: 'check_in' | 'check_out';
  };
  sessions: Array<{
    sessionId: string;
    checkedInAt: Date;
    checkedOutAt: Date | null;
    stayDurationMinutes: number | null;
    isPresent: boolean;
  }>;
}

export const fetchParticipantProfile = async (
  db: Db,
  participantId: string,
): Promise<ParticipantProfile> => {
  const participant = await requireProfileParticipant(db, participantId);
  const sessionRows = await db
    .select({
      id: sessions.id,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .where(eq(sessions.participantId, participantId))
    .orderBy(desc(sessions.checkedInAt));

  const [todayEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.date, todayJST()))
    .limit(1);
  const openToday = todayEvent
    ? await findActiveSessionToday(db, participantId, todayEvent.id)
    : null;
  const now = new Date();
  const sessionsHistory = sessionRows.map((session) => {
    const end = session.checkedOutAt ?? (session.id === openToday?.id ? now : null);
    const stayDurationMinutes = end
      ? Math.max(0, Math.floor((end.getTime() - session.checkedInAt.getTime()) / 60_000))
      : null;
    return {
      sessionId: session.id,
      checkedInAt: session.checkedInAt,
      checkedOutAt: session.checkedOutAt,
      stayDurationMinutes,
      isPresent: session.id === openToday?.id,
    };
  });
  const totalStayDurationMinutes = sessionsHistory.reduce(
    (total, session) => total + (session.stayDurationMinutes ?? 0),
    0,
  );

  return {
    participant,
    stats: {
      visitCount: sessionRows.length,
      lastVisitedAt: sessionRows[0]?.checkedInAt ?? null,
      totalStayDurationMinutes,
    },
    current: {
      isPresent: openToday !== null,
      checkedInAt: openToday?.checkedInAt ?? null,
      nextAction: openToday ? 'check_out' : 'check_in',
    },
    sessions: sessionsHistory,
  };
};

// マニュアル入力画面のニックネーム検索。QR が読めない場面で使うので
// 件数は実用上の上限（同名複数 + タイポ救済）として 50 件に制限する。
export const searchActiveParticipantsByNickname = async (
  db: Db,
  query: string,
  limit = 50,
): Promise<ParticipantSearchItem[]> => {
  const rows = await db
    .select({
      id: participants.id,
      nickname: participants.nickname,
      grade: participants.grade,
    })
    .from(participants)
    .where(and(eq(participants.active, true), like(participants.nickname, `%${query}%`)))
    .orderBy(asc(participants.nickname), asc(participants.id))
    .limit(limit);
  return rows;
};

export const fetchReceptionHistoryToday = async (db: Db): Promise<TodaySessionsResponse> => {
  const [event] = await db
    .select({ id: events.id, date: events.date })
    .from(events)
    .where(eq(events.date, todayJST()))
    .limit(1);

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
      nickname: participants.nickname,
      grade: participants.grade,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(and(eq(sessions.eventId, event.id), eq(participants.active, true)))
    .orderBy(desc(sessions.checkedInAt));

  const items = rows.map((r) => ({
    sessionId: r.sessionId,
    participantId: r.participantId,
    nickname: r.nickname,
    grade: r.grade,
    checkedInAt: r.checkedInAt.toISOString(),
    checkedOutAt: r.checkedOutAt ? r.checkedOutAt.toISOString() : null,
    isPresent: r.checkedOutAt === null,
  }));
  const currentlyPresent = items.filter((item) => item.isPresent).length;

  return {
    event,
    sessions: items,
    summary: {
      totalCheckedIn: items.length,
      currentlyPresent,
      checkedOut: items.length - currentlyPresent,
    },
  };
};

export interface BulkCheckOutResult {
  checkedOutAt: Date;
  participants: Array<{
    participantId: string;
    nickname: string;
    checkedInAt: Date;
    checkedOutAt: Date;
    stayDurationMinutes: number;
  }>;
}

export const recordBulkCheckOut = async (
  db: Db,
  participantIds: string[],
): Promise<BulkCheckOutResult> => {
  const uniqueParticipantIds = Array.from(new Set(participantIds));
  const checkedOutAt = new Date();
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.date, todayJST()))
    .limit(1);

  if (!event || uniqueParticipantIds.length === 0) {
    return { checkedOutAt, participants: [] };
  }

  const openSessions = await db
    .select({
      sessionId: sessions.id,
      participantId: sessions.participantId,
      nickname: participants.nickname,
      checkedInAt: sessions.checkedInAt,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(
      and(
        eq(sessions.eventId, event.id),
        isNull(sessions.checkedOutAt),
        inArray(sessions.participantId, uniqueParticipantIds),
        eq(participants.active, true),
      ),
    );

  if (openSessions.length === 0) {
    return { checkedOutAt, participants: [] };
  }

  const updatedRows = await db
    .update(sessions)
    .set({ checkedOutAt })
    .where(
      and(
        inArray(
          sessions.id,
          openSessions.map((session) => session.sessionId),
        ),
        isNull(sessions.checkedOutAt),
      ),
    )
    .returning({ sessionId: sessions.id });

  const updatedSessionIds = new Set(updatedRows.map((row) => row.sessionId));

  return {
    checkedOutAt,
    participants: openSessions
      .filter((session) => updatedSessionIds.has(session.sessionId))
      .map((session) => ({
        participantId: session.participantId,
        nickname: session.nickname,
        checkedInAt: session.checkedInAt,
        checkedOutAt,
        stayDurationMinutes: Math.floor(
          (checkedOutAt.getTime() - session.checkedInAt.getTime()) / 60_000,
        ),
      })),
  };
};

// /checkin/scan の動作: スキャン値を participants.id として参照し、当日の
// 状態に応じて check-in / check-out のどちらかにルーティングする。
export type ScanResult =
  | { action: 'check_in'; sessionId: string; nickname: string; checkedInAt: Date }
  | {
      action: 'check_out';
      nickname: string;
      checkedInAt: Date;
      checkedOutAt: Date;
      stayDurationMinutes: number;
    };

export const processScanValue = async (db: Db, scanValue: string): Promise<ScanResult> => {
  if (!/^\d{5}$/.test(scanValue)) {
    throw new CheckinError(
      'INVALID_SCAN_VALUE',
      `scan value '${scanValue}' is not a valid 5-digit participant id`,
    );
  }

  // 状態判定のため当日 event_id を先に取得。requireActiveParticipant も
  // recordCheckIn/recordCheckOut の中で呼ばれるが、ここで先に NOT_FOUND を
  // 投げると分岐前に短絡できる。
  await requireActiveParticipant(db, scanValue);
  const eventId = await getOrCreateTodayEvent(db);
  const open = await findActiveSessionToday(db, scanValue, eventId);

  if (open) {
    const result = await recordCheckOut(db, scanValue);
    return { action: 'check_out', ...result };
  }
  const result = await recordCheckIn(db, scanValue);
  return { action: 'check_in', ...result };
};
