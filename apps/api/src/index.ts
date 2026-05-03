import * as schema from '@tecnova/db';
import { participants } from '@tecnova/db';
import { fetchSheetRows } from '@tecnova/shared/google-sheets';
import {
  activateRequestSchema,
  checkInRequestSchema,
  checkOutRequestSchema,
  scanRequestSchema,
} from '@tecnova/shared/schemas';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  activatePreRegistered,
  CheckinError,
  type CheckinErrorCode,
  fetchPreRegisteredList,
  processScanValue,
  recordCheckIn,
  recordCheckOut,
} from './lib/checkin';

type Bindings = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_SHEETS_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// /checkin/* は iPad アプリから認証なしで呼ぶため、CORS は許可しておく。
// 書き込みは sessions/participants の限定操作のみで、設計上の権限境界は保たれる。
app.use('/checkin/*', cors());

const checkinErrorStatus: Record<CheckinErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  INVALID_SCAN_VALUE: 400,
  ALREADY_ACTIVATED: 409,
  ALREADY_CHECKED_IN: 409,
  NOT_CHECKED_IN: 409,
  SHEETS_WRITE_FAILED: 502,
};

const internalError = (e: unknown) => ({
  error: 'INTERNAL' as const,
  message: e instanceof Error ? e.message : String(e),
});

app.get('/health', async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.select({ total: count() }).from(participants);
  return c.json({ status: 'ok', participantsCount: row?.total ?? 0 });
});

app.get('/sheets/health', async (c) => {
  try {
    const rows = await fetchSheetRows(
      c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      c.env.GOOGLE_SHEETS_ID,
      'participants!A2:G',
    );
    return c.json({
      status: 'ok',
      rowCount: rows.length,
      firstRowColumnCount: rows[0]?.length ?? 0,
    });
  } catch (e) {
    return c.json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 未アクティベートの事前登録者一覧
app.get('/checkin/pre-registered', async (c) => {
  try {
    const items = await fetchPreRegisteredList(
      c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      c.env.GOOGLE_SHEETS_ID,
    );
    return c.json({ participants: items });
  } catch (e) {
    return c.json(internalError(e), 500);
  }
});

// 事前登録者をアクティベートし、内製IDを採番、初回チェックインを記録
app.post('/checkin/activate', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = activateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });

  try {
    const result = await activatePreRegistered({
      db,
      encodedKey: c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      spreadsheetId: c.env.GOOGLE_SHEETS_ID,
      preRegistrationId: parsed.data.preRegistrationId,
    });
    return c.json({
      participantId: result.participantId,
      nickname: result.nickname,
      grade: result.grade,
      checkedInAt: result.checkedInAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// 通常チェックイン（既存参加者・明示的チェックイン）
app.post('/checkin/sessions/check-in', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = checkInRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await recordCheckIn(db, parsed.data.participantId);
    return c.json({
      sessionId: result.sessionId,
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// チェックアウト（明示的チェックアウト）
app.post('/checkin/sessions/check-out', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = checkOutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await recordCheckOut(db, parsed.data.participantId);
    return c.json({
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
      checkedOutAt: result.checkedOutAt.toISOString(),
      stayDurationMinutes: result.stayDurationMinutes,
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// QR/バーコードスキャン用統合エンドポイント。スキャン値（5桁の participants.id）から
// 当日の状態を判定し、check-in or check-out にディスパッチする。
app.post('/checkin/scan', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await processScanValue(db, parsed.data.scanValue);
    if (result.action === 'check_in') {
      return c.json({
        action: 'check_in' as const,
        sessionId: result.sessionId,
        nickname: result.nickname,
        checkedInAt: result.checkedInAt.toISOString(),
      });
    }
    return c.json({
      action: 'check_out' as const,
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
      checkedOutAt: result.checkedOutAt.toISOString(),
      stayDurationMinutes: result.stayDurationMinutes,
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

export default app;
