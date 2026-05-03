import type * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import { fetchSheetRows, updateSheetRow } from '@tecnova/shared/google-sheets';
import { desc, eq, like } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

type Db = DrizzleD1Database<typeof schema>;

const SHEET_RANGE = 'participants!A2:G';

interface PreRegRow {
  rowNumber: number; // 1-indexed sheet row。ヘッダーが1行目なので A2:G を読んだ場合 index 0 → row 2
  preRegistrationId: string;
  nickname: string;
  grade: string;
  registeredAt: string;
  internalId: string;
  activatedAt: string;
  activated: boolean;
}

const parseSheetRows = (rows: string[][]): PreRegRow[] =>
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

export class CheckinError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'ALREADY_ACTIVATED' | 'SHEETS_WRITE_FAILED',
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
