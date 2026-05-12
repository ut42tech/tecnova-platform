import { Hono } from 'hono';
import { apiErrorHandler } from './lib/errors';
import { requireAuthenticatedMentor } from './middleware/auth';
import { apiCors } from './middleware/cors';
import { adminRoute } from './routes/admin';
import { authRoute } from './routes/auth';
import { checkinRoute } from './routes/checkin';
import { healthRoute } from './routes/health';
import { preRegistrationsRoute } from './routes/pre-registrations';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

// /api/* と /checkin/* は両方とも cookie-based セッション必須。
// CORS は両方とも TRUSTED_ORIGINS ベース・credentials: true で共通。
app.use('/api/*', apiCors);
app.use('/checkin/*', apiCors);

// Better Auth ハンドラは認証ミドルウェアより前に登録する必要がある。
// requireAuthenticatedMentor 側でも /api/auth/* は素通しする防御を入れて
// いるが、登録順でも auth ルートが先に解決されるようにしておく。
app.route('/api/auth', authRoute);

app.use('/api/*', requireAuthenticatedMentor);
app.use('/checkin/*', requireAuthenticatedMentor);

app.route('/api', adminRoute);
app.route('/api/pre-registrations', preRegistrationsRoute);
app.route('/checkin', checkinRoute);
app.route('/', healthRoute);

// 各ルート内で投げられたドメインエラー（CheckinError 等）と未知のエラーを
// 一括で HTTP レスポンスに変換する。route ハンドラに try/catch を書かずに
// 済むのはこれのおかげ。
app.onError(apiErrorHandler);

export default app;
