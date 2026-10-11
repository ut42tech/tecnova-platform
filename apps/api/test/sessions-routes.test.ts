import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiErrorHandler } from '../src/lib/errors';
import { adminRoute } from '../src/routes/admin';
import type { AppEnv, Bindings } from '../src/types';
import { jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

// Better Auth を通さずに mentor を差し込んだアプリ。ルート単位の requireAdmin とエラー変換を確かめる。
const appAs = (role: 'admin' | 'mentor') => {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('user', { id: 'u1', email: 'tester@example.com', name: 'Tester' });
    c.set('mentor', { id: 'm1', email: 'tester@example.com', name: 'Tester', role });
    await next();
  });
  app.route('/api', adminRoute);
  app.onError(apiErrorHandler);
  return app;
};

// ルートは new Date() を現在時刻に使うので、どの実行日でも過去になる日付を使う。
const PAST = '2026-01-15';
const bindings = env as unknown as Bindings;
const db = testDb();

const send = (app: Hono<AppEnv>, method: string, path: string, body?: unknown) =>
  app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    bindings,
  );

const validBody = {
  participantId: '26001',
  checkedInAt: jst(PAST, '10:00').toISOString(),
  checkedOutAt: jst(PAST, '11:00').toISOString(),
};

describe('/api/sessions の修正ルート', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
  });

  it('admin 以外は POST / PATCH / DELETE が 403', async () => {
    const app = appAs('mentor');
    expect((await send(app, 'POST', '/api/sessions', validBody)).status).toBe(403);
    expect((await send(app, 'PATCH', '/api/sessions/x', { checkedOutAt: null })).status).toBe(403);
    expect((await send(app, 'DELETE', '/api/sessions/x')).status).toBe(403);
  });

  it('admin 以外でも一覧の GET は使える', async () => {
    const res = await send(appAs('mentor'), 'GET', `/api/sessions?date=${PAST}`);
    expect(res.status).toBe(200);
  });

  it('admin の POST は 201 で eventDate と記録を返す', async () => {
    const res = await send(appAs('admin'), 'POST', '/api/sessions', validBody);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { eventDate: string; session: { participantId: string } };
    expect(body.eventDate).toBe(PAST);
    expect(body.session.participantId).toBe('26001');
  });

  it('本文の形式が違うと 400', async () => {
    const res = await send(appAs('admin'), 'POST', '/api/sessions', { participantId: '1' });
    expect(res.status).toBe(400);
  });

  it('ルール違反はコードと日本語メッセージで返す（重なりは 409）', async () => {
    await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:30',
      outTime: '12:00',
    });
    const res = await send(appAs('admin'), 'POST', '/api/sessions', validBody);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'OVERLAP',
      message: '同じ子の同じ日の別の記録と時間が重なっています',
    });
  });

  it('admin の PATCH は 200、DELETE は 204、存在しない記録の DELETE は 404', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    const app = appAs('admin');
    const patched = await send(app, 'PATCH', `/api/sessions/${id}`, {
      checkedOutAt: jst(PAST, '11:30').toISOString(),
    });
    expect(patched.status).toBe(200);
    expect((await send(app, 'DELETE', `/api/sessions/${id}`)).status).toBe(204);
    const missing = await send(app, 'DELETE', `/api/sessions/${id}`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'SESSION_NOT_FOUND' });
  });
});
