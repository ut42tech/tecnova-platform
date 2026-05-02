import { participants } from '@tecnova/db';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// D1 バインディング疎通確認用。participants テーブルへの SELECT が通れば
// マイグレーション適用済み・Drizzle スキーマと整合・Workers バインディング正常、の3点を一度に検証できる。
app.get('/health', async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.select({ total: count() }).from(participants);
  return c.json({ status: 'ok', participantsCount: row?.total ?? 0 });
});

export default app;
