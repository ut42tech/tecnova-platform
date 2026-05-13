import { appendSheetRows, clearSheetRange, fetchSheetRows } from '@tecnova/shared/google-sheets';
import type {
  ActivatedPreRegistrationItem,
  CreatePreRegistrationRequest,
  PreRegistrationItem,
  PreRegistrationsListResponse,
} from '@tecnova/shared/schemas';
import { isActivatedPreRegRow, type PreRegRow, parseSheetRows, SHEET_RANGE } from './checkin';

export type PreRegistrationErrorCode = 'NOT_FOUND' | 'ALREADY_ACTIVATED' | 'SHEETS_WRITE_FAILED';

export class PreRegistrationError extends Error {
  constructor(
    public readonly code: PreRegistrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PreRegistrationError';
  }
}

const toItem = (row: PreRegRow): PreRegistrationItem => ({
  preRegistrationId: row.preRegistrationId,
  fullName: row.fullName,
  nickname: row.nickname,
  grade: row.grade,
  registeredAt: row.registeredAt,
});

const toActivatedItem = (row: PreRegRow): ActivatedPreRegistrationItem => ({
  ...toItem(row),
  internalId: row.internalId,
  activatedAt: row.activatedAt,
});

export const fetchPreRegistrationsList = async (
  encodedKey: string,
  spreadsheetId: string,
): Promise<PreRegistrationsListResponse> => {
  const raw = await fetchSheetRows(encodedKey, spreadsheetId, SHEET_RANGE);
  const rows = parseSheetRows(raw);
  const items = rows
    .filter((r) => !isActivatedPreRegRow(r))
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
    .map(toItem);
  const activatedItems = rows
    .filter(isActivatedPreRegRow)
    .sort(
      (a, b) =>
        b.activatedAt.localeCompare(a.activatedAt) || b.registeredAt.localeCompare(a.registeredAt),
    )
    .map(toActivatedItem);
  return { preRegistrations: items, activatedPreRegistrations: activatedItems };
};

// `PRE-{year}-{NNNN}` 形式。year は JST 現在年、連番は当該年プレフィックスで
// 既存最大値 + 1。スプシ全体（アクティベート済も含む）から探索することで、
// 削除済（クリア後）の番号は再利用しないが、活動済の番号も再利用しないため
// 衝突は実質起きない。
const generateNextPreRegistrationId = (rows: PreRegRow[]): string => {
  const year = Number.parseInt(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(
      new Date(),
    ),
    10,
  );
  const prefix = `PRE-${year}-`;
  const maxNum = rows
    .map((r) => r.preRegistrationId)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((acc, n) => (n > acc ? n : acc), 0);
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
};

export const createPreRegistration = async (
  encodedKey: string,
  spreadsheetId: string,
  input: CreatePreRegistrationRequest,
): Promise<PreRegistrationItem> => {
  // 採番のために既存IDを総ナメ。MVP では同時操作を考慮しないので
  // 「読んで採番→append」のレースは未対応（現実にはほぼ起こらない）。
  const raw = await fetchSheetRows(encodedKey, spreadsheetId, SHEET_RANGE);
  const rows = parseSheetRows(raw);
  const preRegistrationId = generateNextPreRegistrationId(rows);

  // A〜E列のみ（F:G:H はバックエンドが activate 時に書き込む列なので空のまま）。
  // 列構成: A=preRegId / B=氏名 / C=ニックネーム / D=学年 / E=事前登録日
  // appendSheetRows は INSERT_ROWS で挿入するので、クリア跡の空行を上書きしない。
  try {
    await appendSheetRows(encodedKey, spreadsheetId, 'participants!A:E', [
      [preRegistrationId, input.fullName, input.nickname, input.grade, input.registeredAt],
    ]);
  } catch (e) {
    throw new PreRegistrationError(
      'SHEETS_WRITE_FAILED',
      e instanceof Error ? e.message : String(e),
    );
  }

  return {
    preRegistrationId,
    fullName: input.fullName,
    nickname: input.nickname,
    grade: input.grade,
    registeredAt: input.registeredAt,
  };
};

export const deletePreRegistration = async (
  encodedKey: string,
  spreadsheetId: string,
  preRegistrationId: string,
): Promise<void> => {
  // 削除直前に再読み込みしてアクティベート状態を再確認する。
  // GET 時点で未アクティベートでも、その間に iPad からアクティベートされる可能性がある。
  const raw = await fetchSheetRows(encodedKey, spreadsheetId, SHEET_RANGE);
  const target = parseSheetRows(raw).find((r) => r.preRegistrationId === preRegistrationId);
  if (!target) {
    throw new PreRegistrationError('NOT_FOUND', `pre-registration ${preRegistrationId} not found`);
  }
  if (isActivatedPreRegRow(target)) {
    throw new PreRegistrationError(
      'ALREADY_ACTIVATED',
      `${preRegistrationId} is already activated; refusing to delete`,
    );
  }

  try {
    await clearSheetRange(
      encodedKey,
      spreadsheetId,
      `participants!A${target.rowNumber}:H${target.rowNumber}`,
    );
  } catch (e) {
    throw new PreRegistrationError(
      'SHEETS_WRITE_FAILED',
      e instanceof Error ? e.message : String(e),
    );
  }
};
