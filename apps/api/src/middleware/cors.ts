import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { parseTrustedOrigins } from '../lib/auth';
import type { AppEnv } from '../types';

// /api/* と /checkin/* は admin / iPad アプリから cross-origin で呼ばれる。
// Better Auth のセッションクッキーを同送するため credentials: true を必須にし、
// 許可オリジンは TRUSTED_ORIGINS（カンマ区切り）から都度解決する。
export const apiCors = createMiddleware<AppEnv>((c, next) =>
  cors({
    origin: (origin) => {
      const allowed = parseTrustedOrigins(c.env.TRUSTED_ORIGINS);
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next),
);
