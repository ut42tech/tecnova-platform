import {
  createMentorRequestSchema,
  participantsListQuerySchema,
  participationSummaryQuerySchema,
  sessionsByDateQuerySchema,
  updateMentorRequestSchema,
} from '@tecnova/shared/schemas';
import { Hono } from 'hono';
import {
  createMentor,
  fetchEventsList,
  fetchMentorsList,
  fetchParticipantsList,
  fetchParticipationSummary,
  fetchSessionsForEvent,
  fetchTodaySessions,
  updateMentor,
} from '../lib/admin';
import { invalidBodyError, invalidQueryError } from '../lib/errors';
import { createDb, requireAdmin } from '../middleware/auth';
import type { AppEnv } from '../types';

export const adminRoute = new Hono<AppEnv>();

// 認証確認用：ログイン中の user / mentor 情報を返す。管理画面のフロントが
// セッション復元の確認や上部のユーザー名表示に使う。
adminRoute.get('/me', (c) =>
  c.json({
    user: c.get('user'),
    mentor: c.get('mentor'),
  }),
);

// 当日（JST）の来場者一覧。dashboard 用。
// 当日の event がまだ無ければ event=null と空配列を返す。
// `/sessions` の date 省略時と同じ結果。フロント側互換のため残している。
adminRoute.get('/sessions/today', async (c) => c.json(await fetchTodaySessions(createDb(c.env))));

// 任意日（JST）のセッション一覧。date 省略時は今日。
// レスポンス形は /sessions/today と同じ。
adminRoute.get('/sessions', async (c) => {
  const parsed = sessionsByDateQuerySchema.safeParse({ date: c.req.query('date') });
  if (!parsed.success) {
    return c.json(invalidQueryError, 400);
  }
  return c.json(await fetchSessionsForEvent(createDb(c.env), parsed.data.date ?? null));
});

// 過去開催日のセレクタ用（最新 50 件）。
adminRoute.get('/events', async (c) => c.json(await fetchEventsList(createDb(c.env))));

// 会場全体の参加回数集計（ターム別・日別）。from/to で期間を絞れる（いずれも JST・含む）。
// counted 判定は SQL で表現できないため lib 側で JS 集計する。
adminRoute.get('/stats/participation', async (c) => {
  const parsed = participationSummaryQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(invalidQueryError, 400);
  }
  return c.json(await fetchParticipationSummary(createDb(c.env), parsed.data));
});

// 利用者一覧。ページネーション + ID / 氏名 / ニックネーム検索 + 学年 / 有効状態フィルタ。
adminRoute.get('/participants', async (c) => {
  const parsed = participantsListQuerySchema.safeParse({
    page: c.req.query('page'),
    limit: c.req.query('limit'),
    search: c.req.query('search'),
    grade: c.req.query('grade'),
    active: c.req.query('active'),
  });
  if (!parsed.success) {
    return c.json(invalidQueryError, 400);
  }
  return c.json(await fetchParticipantsList(createDb(c.env), parsed.data));
});

// メンター CRUD は admin 専用。サブルート単位で requireAdmin を当てる。
const mentorsRoute = new Hono<AppEnv>();
mentorsRoute.use('*', requireAdmin);

mentorsRoute.get('/', async (c) => c.json(await fetchMentorsList(createDb(c.env))));

mentorsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createMentorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const mentor = await createMentor(createDb(c.env), parsed.data);
  return c.json(mentor, 201);
});

mentorsRoute.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = updateMentorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  return c.json(await updateMentor(createDb(c.env), id, parsed.data));
});

adminRoute.route('/mentors', mentorsRoute);
