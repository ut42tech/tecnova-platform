import { participants } from '@tecnova/db';
import { fetchSheetRows } from '@tecnova/shared/google-sheets';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_SHEETS_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// D1 バインディング疎通確認用。participants テーブルへの SELECT が通れば
// マイグレーション適用済み・Drizzle スキーマと整合・Workers バインディング正常、の3点を一度に検証できる。
app.get('/health', async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.select({ total: count() }).from(participants);
  return c.json({ status: 'ok', participantsCount: row?.total ?? 0 });
});

// Google Sheets API 疎通確認用。学生側スプシの participants シートを A2:G で読み取り、
// 行数とヘッダー直下の最初の行（ある場合）の列数を返す。
// 鍵情報は返さない。値（ニックネーム等）も意図的に返さない。
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

export default app;
