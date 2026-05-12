import { createPreRegistrationRequestSchema } from '@tecnova/shared/schemas';
import { Hono } from 'hono';
import { invalidBodyError } from '../lib/errors';
import {
  createPreRegistration,
  deletePreRegistration,
  fetchPreRegistrationsList,
} from '../lib/pre-registrations';
import { requireAdmin } from '../middleware/auth';
import type { AppEnv } from '../types';

// 事前登録（学生側スプシ）の参照・追加・削除。すべて admin ロール専用。
export const preRegistrationsRoute = new Hono<AppEnv>();

preRegistrationsRoute.use('*', requireAdmin);

preRegistrationsRoute.get('/', async (c) =>
  c.json(await fetchPreRegistrationsList(c.env.GOOGLE_SERVICE_ACCOUNT_KEY, c.env.GOOGLE_SHEETS_ID)),
);

// 追加（preRegistrationId はバックエンドが採番して返す）
preRegistrationsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createPreRegistrationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const item = await createPreRegistration(
    c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    c.env.GOOGLE_SHEETS_ID,
    parsed.data,
  );
  return c.json(item, 201);
});

// 削除（未アクティベートのみ。アクティベート済は 409）
preRegistrationsRoute.delete('/:preRegistrationId', async (c) => {
  await deletePreRegistration(
    c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    c.env.GOOGLE_SHEETS_ID,
    c.req.param('preRegistrationId'),
  );
  return c.body(null, 204);
});
