import * as schema from '@tecnova/db';
import { mentors } from '@tecnova/db';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { createMiddleware } from 'hono/factory';
import { createAuth } from '../lib/auth';
import type { AppEnv, Bindings } from '../types';

export const createDb = (env: Bindings) => drizzle(env.DB, { schema });

// セッション取得 → mentors テーブル突合 で2段判定する。
// signIn 時の許可リスト判定は OAuth コールバック側で同じ突合を行う想定だが、
// このミドルウェアでも毎リクエスト確認することで、後から `active=false` に
// された mentor が古いセッションで API を叩き続けるのを防ぐ。
//
// /api/auth/* は Better Auth ハンドラ自体が認証フローを担うので、
// このミドルウェアが /api/* に適用された結果として呼ばれた場合は素通しする。
export const requireAuthenticatedMentor = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next();

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'UNAUTHORIZED', message: 'session required' }, 401);
  }

  const db = createDb(c.env);
  const [mentor] = await db
    .select({
      id: mentors.id,
      email: mentors.email,
      name: mentors.name,
      role: mentors.role,
      active: mentors.active,
    })
    .from(mentors)
    .where(and(eq(mentors.email, session.user.email), eq(mentors.active, true)))
    .limit(1);

  if (!mentor) {
    return c.json({ error: 'FORBIDDEN', message: 'email not in mentor allowlist' }, 403);
  }

  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  c.set('mentor', {
    id: mentor.id,
    email: mentor.email,
    name: mentor.name,
    role: mentor.role,
  });
  await next();
});

// admin ロール専用エンドポイントのガード。requireAuthenticatedMentor で
// mentor を解決済みである前提で、role を弾く責務だけを持つ。
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const mentor = c.get('mentor');
  if (mentor.role !== 'admin') {
    return c.json({ error: 'FORBIDDEN', message: 'admin role required' }, 403);
  }
  await next();
});
