import * as schema from '@tecnova/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';

interface Env {
  DB: D1Database;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

// Cloudflare Workers では betterAuth instance をグローバルに保持しない
// （D1 接続まわりでロックを掴んだままのリクエストが残るとハングするため）。
// リクエスト毎にこのファクトリを呼んで使い切る。
//
// docs/mvp.md 11.1 / CLAUDE.md「重要な制約 2」参照。
export const createAuth = (env: Env) => {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // D1 はインタラクティブ・トランザクションを持たないので false。
      transaction: false,
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      },
    },
    // 管理画面（apps/admin）からの cross-origin リクエストを許可する。
    // 本番ドメインは後で env 経由に置き換える想定。
    trustedOrigins: ['http://localhost:3001'],
  });
};

export type Auth = ReturnType<typeof createAuth>;
