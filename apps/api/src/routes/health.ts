import { participants } from '@tecnova/db';
import { fetchSheetRows } from '@tecnova/shared/google-sheets';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { AppEnv } from '../types';

// health 系はパブリック。/sheets/health は Sheets API の到達性確認用に
// 失敗時もエラーレスポンスをそのまま返したいので、ここでは onError に
// 渡さず明示的に try/catch する。
export const healthRoute = new Hono<AppEnv>();

healthRoute.get('/health', async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.select({ total: count() }).from(participants);
  return c.json({ status: 'ok', participantsCount: row?.total ?? 0 });
});

healthRoute.get('/sheets/health', async (c) => {
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
