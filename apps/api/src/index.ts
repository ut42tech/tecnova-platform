import * as schema from '@tecnova/db';
import { mentors, participants } from '@tecnova/db';
import { fetchSheetRows } from '@tecnova/shared/google-sheets';
import {
  activateRequestSchema,
  checkInRequestSchema,
  checkOutRequestSchema,
  createMentorRequestSchema,
  participantsListQuerySchema,
  scanRequestSchema,
  updateMentorRequestSchema,
} from '@tecnova/shared/schemas';
import { and, count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono/types';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  createMentor,
  fetchMentorsList,
  fetchParticipantsList,
  fetchTodaySessions,
  MentorError,
  type MentorErrorCode,
  updateMentor,
} from './lib/admin';
import { createAuth, parseTrustedOrigins } from './lib/auth';
import {
  activatePreRegistered,
  CheckinError,
  type CheckinErrorCode,
  fetchPreRegisteredList,
  processScanValue,
  recordCheckIn,
  recordCheckOut,
} from './lib/checkin';

type Bindings = {
  DB: D1Database;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_SHEETS_ID: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  TRUSTED_ORIGINS: string;
};

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthMentor {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'mentor';
}

type Variables = {
  user: AuthUser;
  mentor: AuthMentor;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// /checkin/* は iPad アプリから認証なしで呼ぶため、CORS は許可しておく。
// 書き込みは sessions/participants の限定操作のみで、設計上の権限境界は保たれる。
app.use('/checkin/*', cors());

// /api/* は管理画面からの呼び出し。Better Auth がセッションクッキーを発行するので
// CORS は credentials を許可した上で trustedOrigins と整合させる。
// 許可オリジンは `TRUSTED_ORIGINS`（カンマ区切り）から動的に解決する。
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowed = parseTrustedOrigins(c.env.TRUSTED_ORIGINS);
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// Better Auth のエンドポイント群（/api/auth/sign-in/* /api/auth/callback/*
// /api/auth/session など）。リクエスト毎に instance を生成して使い切る。
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// /api/auth/* 以外の /api/* は認証必須。
// セッション取得 → mentors テーブル突合 で2段判定する。
// signIn 時の許可リスト判定は OAuth コールバック側で同じ突合を行う想定だが、
// このミドルウェアでも毎リクエスト確認することで、後から `active=false` に
// された mentor が古いセッションで API を叩き続けるのを防ぐ。
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next();

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'UNAUTHORIZED', message: 'session required' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
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

// 認証確認用：ログイン中の user / mentor 情報を返す。管理画面のフロントが
// セッション復元の確認や上部のユーザー名表示に使う。
app.get('/api/me', (c) => {
  return c.json({
    user: c.get('user'),
    mentor: c.get('mentor'),
  });
});

// 当日（JST）の来場者一覧。dashboard 用。
// 当日の event がまだ無ければ event=null と空配列を返す。
app.get('/api/sessions/today', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await fetchTodaySessions(db);
    return c.json(result);
  } catch (e) {
    return c.json(internalError(e), 500);
  }
});

// 参加者一覧。ページネーション + ニックネーム部分一致検索。
app.get('/api/participants', async (c) => {
  const parsed = participantsListQuerySchema.safeParse({
    page: c.req.query('page'),
    limit: c.req.query('limit'),
    search: c.req.query('search'),
  });
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid query parameters' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await fetchParticipantsList(db, parsed.data);
    return c.json(result);
  } catch (e) {
    return c.json(internalError(e), 500);
  }
});

// admin role 専用エンドポイントのガード。/api/* の認証ミドルウェアで mentor を
// 解決済みである前提で、role を弾く責務だけを持つ。
const requireAdmin: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (
  c,
  next,
) => {
  const mentor = c.get('mentor');
  if (mentor.role !== 'admin') {
    return c.json({ error: 'FORBIDDEN', message: 'admin role required' }, 403);
  }
  await next();
};

app.use('/api/mentors', requireAdmin);
app.use('/api/mentors/*', requireAdmin);

// メンター一覧。createdAt 昇順（運営の登録順）。
app.get('/api/mentors', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await fetchMentorsList(db);
    return c.json(result);
  } catch (e) {
    return c.json(internalError(e), 500);
  }
});

// メンター追加
app.post('/api/mentors', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createMentorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const mentor = await createMentor(db, parsed.data);
    return c.json(mentor, 201);
  } catch (e) {
    if (e instanceof MentorError) {
      return c.json({ error: e.code, message: e.message }, mentorErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// メンター編集（部分更新）。email は変更不可、role と active は admin が切り替える。
app.patch('/api/mentors/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = updateMentorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const mentor = await updateMentor(db, id, parsed.data);
    return c.json(mentor);
  } catch (e) {
    if (e instanceof MentorError) {
      return c.json({ error: e.code, message: e.message }, mentorErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

const mentorErrorStatus: Record<MentorErrorCode, ContentfulStatusCode> = {
  EMAIL_ALREADY_EXISTS: 409,
  NOT_FOUND: 404,
};

const checkinErrorStatus: Record<CheckinErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  INVALID_SCAN_VALUE: 400,
  ALREADY_ACTIVATED: 409,
  ALREADY_CHECKED_IN: 409,
  NOT_CHECKED_IN: 409,
  SHEETS_WRITE_FAILED: 502,
};

const internalError = (e: unknown) => ({
  error: 'INTERNAL' as const,
  message: e instanceof Error ? e.message : String(e),
});

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
    return c.json(internalError(e), 500);
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
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// 通常チェックイン（既存参加者・明示的チェックイン）
app.post('/checkin/sessions/check-in', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = checkInRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await recordCheckIn(db, parsed.data.participantId);
    return c.json({
      sessionId: result.sessionId,
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// チェックアウト（明示的チェックアウト）
app.post('/checkin/sessions/check-out', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = checkOutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await recordCheckOut(db, parsed.data.participantId);
    return c.json({
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
      checkedOutAt: result.checkedOutAt.toISOString(),
      stayDurationMinutes: result.stayDurationMinutes,
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

// QR/バーコードスキャン用統合エンドポイント。スキャン値（5桁の participants.id）から
// 当日の状態を判定し、check-in or check-out にディスパッチする。
app.post('/checkin/scan', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'INTERNAL', message: 'invalid request body' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const result = await processScanValue(db, parsed.data.scanValue);
    if (result.action === 'check_in') {
      return c.json({
        action: 'check_in' as const,
        sessionId: result.sessionId,
        nickname: result.nickname,
        checkedInAt: result.checkedInAt.toISOString(),
      });
    }
    return c.json({
      action: 'check_out' as const,
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
      checkedOutAt: result.checkedOutAt.toISOString(),
      stayDurationMinutes: result.stayDurationMinutes,
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
    }
    return c.json(internalError(e), 500);
  }
});

export default app;
