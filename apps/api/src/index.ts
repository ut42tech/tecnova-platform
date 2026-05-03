import * as schema from '@tecnova/db';
import { participants } from '@tecnova/db';
import { fetchSheetRows } from '@tecnova/shared/google-sheets';
import { activateRequestSchema } from '@tecnova/shared/schemas';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { activatePreRegistered, CheckinError, fetchPreRegisteredList } from './lib/checkin';

type Bindings = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_SHEETS_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// /checkin/* は iPad アプリから認証なしで呼ぶため、CORS は許可しておく。
// 書き込みは sessions/participants の限定操作のみで、設計上の権限境界は保たれる。
app.use('/checkin/*', cors());

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
    return c.json(
      {
        error: 'INTERNAL',
        message: e instanceof Error ? e.message : String(e),
      },
      500,
    );
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
      const status = e.code === 'NOT_FOUND' ? 404 : 409;
      return c.json({ error: e.code, message: e.message }, status);
    }
    return c.json(
      {
        error: 'INTERNAL',
        message: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});

export default app;
