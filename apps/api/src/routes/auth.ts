import { Hono } from 'hono';
import { createAuth } from '../lib/auth';
import type { AppEnv } from '../types';

// Better Auth のエンドポイント群（/api/auth/sign-in/* /api/auth/callback/*
// /api/auth/session など）。リクエスト毎に instance を生成して使い切る。
export const authRoute = new Hono<AppEnv>();

authRoute.on(['GET', 'POST'], '/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});
