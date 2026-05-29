import {
  activateRequestSchema,
  checkInRequestSchema,
  checkOutRequestSchema,
  historyBulkCheckOutRequestSchema,
  participantSearchQuerySchema,
  scanRequestSchema,
} from '@tecnova/shared/schemas';
import { type Context, Hono } from 'hono';
import {
  activatePreRegistered,
  fetchParticipantProfile,
  fetchPreRegisteredList,
  fetchReceptionHistoryToday,
  processScanValue,
  recordBulkCheckOut,
  recordCheckIn,
  recordCheckOut,
  searchActiveParticipantsByNickname,
} from '../lib/checkin';
import { createParticipantDriveFolder } from '../lib/drive-folder';
import { invalidBodyError, invalidQueryError } from '../lib/errors';
import { createDb } from '../middleware/auth';
import type { AppEnv } from '../types';

export const checkinRoute = new Hono<AppEnv>();

// Drive folder 作成は失敗してもチェックインを止めないため、
// レスポンス送信後のバックグラウンドタスクとして waitUntil で実行する。
const queueDriveFolderCreation = (c: Context<AppEnv>, participantId: string, nickname: string) => {
  const url = c.env.GAS_DRIVE_WEBHOOK_URL?.trim();
  const secret = c.env.GAS_DRIVE_WEBHOOK_SECRET?.trim();
  if (!url && !secret) return;
  if (!url || !secret) {
    console.warn('GAS Drive webhook is partially configured; skipping folder creation');
    return;
  }

  const promise = createParticipantDriveFolder({ url, secret, participantId, nickname })
    .then((folder) => {
      console.log(
        `Drive folder ready for participant ${participantId}: ${folder.folderName} (${folder.folderId}) reused=${folder.reused}`,
      );
    })
    .catch((e) => {
      console.error(`Drive folder creation failed for participant ${participantId}:`, e);
    });

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    void promise;
  }
};

const serializeScanResult = (result: Awaited<ReturnType<typeof processScanValue>>) => {
  if (result.action === 'check_in') {
    return {
      action: 'check_in' as const,
      sessionId: result.sessionId,
      fullName: result.fullName,
      nickname: result.nickname,
      checkedInAt: result.checkedInAt.toISOString(),
    };
  }
  return {
    action: 'check_out' as const,
    fullName: result.fullName,
    nickname: result.nickname,
    checkedInAt: result.checkedInAt.toISOString(),
    checkedOutAt: result.checkedOutAt.toISOString(),
    stayDurationMinutes: result.stayDurationMinutes,
  };
};

// 未アクティベートの事前登録者一覧
checkinRoute.get('/pre-registered', async (c) => {
  const items = await fetchPreRegisteredList(
    c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    c.env.GOOGLE_SHEETS_ID,
  );
  return c.json({ participants: items });
});

// 事前登録者をアクティベートし、内製IDを採番、初回チェックインを記録
checkinRoute.post('/activate', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = activateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }

  const result = await activatePreRegistered({
    db: createDb(c.env),
    encodedKey: c.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    spreadsheetId: c.env.GOOGLE_SHEETS_ID,
    preRegistrationId: parsed.data.preRegistrationId,
  });
  queueDriveFolderCreation(c, result.participantId, result.nickname);
  return c.json({
    participantId: result.participantId,
    fullName: result.fullName,
    nickname: result.nickname,
    grade: result.grade,
    checkedInAt: result.checkedInAt.toISOString(),
  });
});

// 通常チェックイン（既存参加者・明示的チェックイン）
checkinRoute.post('/sessions/check-in', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = checkInRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const result = await recordCheckIn(createDb(c.env), parsed.data.participantId);
  return c.json({
    sessionId: result.sessionId,
    fullName: result.fullName,
    nickname: result.nickname,
    checkedInAt: result.checkedInAt.toISOString(),
  });
});

// チェックアウト（明示的チェックアウト）
checkinRoute.post('/sessions/check-out', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = checkOutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const result = await recordCheckOut(createDb(c.env), parsed.data.participantId);
  return c.json({
    fullName: result.fullName,
    nickname: result.nickname,
    checkedInAt: result.checkedInAt.toISOString(),
    checkedOutAt: result.checkedOutAt.toISOString(),
    stayDurationMinutes: result.stayDurationMinutes,
  });
});

// 受付用の当日履歴。QR が手元にない参加者のステータス確認や
// 閉場時の一括チェックアウト導線で使う。
checkinRoute.get('/history/today', async (c) =>
  c.json(await fetchReceptionHistoryToday(createDb(c.env))),
);

// 受付用の複数チェックアウト。既に退室済みの参加者は対象外として扱い、
// 実際に更新できたセッションだけをレスポンスに含める。
checkinRoute.post('/history/check-out-bulk', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = historyBulkCheckOutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const result = await recordBulkCheckOut(createDb(c.env), parsed.data.participantIds);
  return c.json({
    checkedOutAt: result.checkedOutAt.toISOString(),
    checkedOutCount: result.participants.length,
    participants: result.participants.map((participant) => ({
      participantId: participant.participantId,
      fullName: participant.fullName,
      nickname: participant.nickname,
      checkedInAt: participant.checkedInAt.toISOString(),
      checkedOutAt: participant.checkedOutAt.toISOString(),
      stayDurationMinutes: participant.stayDurationMinutes,
    })),
  });
});

// マニュアル入力画面のニックネーム検索。`:participantId` ルートより前に
// 登録する必要があるので注意（Hono は登録順マッチ）。
checkinRoute.get('/participants/search', async (c) => {
  const parsed = participantSearchQuerySchema.safeParse({ q: c.req.query('q') });
  if (!parsed.success) {
    return c.json(invalidQueryError, 400);
  }
  const items = await searchActiveParticipantsByNickname(createDb(c.env), parsed.data.q);
  return c.json({ participants: items });
});

// 受付専用の参加者プロフィール。QR/手入力後はまずここを表示し、
// 現在の状態に応じた操作だけをフロントに出す。
checkinRoute.get('/participants/:participantId', async (c) => {
  const participantId = c.req.param('participantId');
  const parsed = checkInRequestSchema.safeParse({ participantId });
  if (!parsed.success) {
    return c.json(invalidQueryError, 400);
  }
  const profile = await fetchParticipantProfile(createDb(c.env), parsed.data.participantId);
  return c.json({
    participant: {
      id: profile.participant.id,
      fullName: profile.participant.fullName,
      nickname: profile.participant.nickname,
      grade: profile.participant.grade,
      activatedAt: profile.participant.activatedAt.toISOString(),
    },
    stats: {
      visitCount: profile.stats.visitCount,
      participationCount: profile.stats.participationCount,
      lastVisitedAt: profile.stats.lastVisitedAt ? profile.stats.lastVisitedAt.toISOString() : null,
      totalStayDurationMinutes: profile.stats.totalStayDurationMinutes,
    },
    current: {
      isPresent: profile.current.isPresent,
      checkedInAt: profile.current.checkedInAt ? profile.current.checkedInAt.toISOString() : null,
      nextAction: profile.current.nextAction,
    },
    sessions: profile.sessions.map((session) => ({
      sessionId: session.sessionId,
      checkedInAt: session.checkedInAt.toISOString(),
      checkedOutAt: session.checkedOutAt ? session.checkedOutAt.toISOString() : null,
      stayDurationMinutes: session.stayDurationMinutes,
      isPresent: session.isPresent,
      term: session.term,
      counted: session.counted,
    })),
  });
});

// 受付プロフィール画面からの実行操作。サーバー側で現在状態を再判定して、
// check-in / check-out のどちらか一方を実行する。
checkinRoute.post('/participants/:participantId/attendance', async (c) => {
  const participantId = c.req.param('participantId');
  const parsed = checkInRequestSchema.safeParse({ participantId });
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const result = await processScanValue(createDb(c.env), parsed.data.participantId);
  return c.json(serializeScanResult(result));
});

// QR/バーコードスキャン用統合エンドポイント。スキャン値（5桁の participants.id）から
// 当日の状態を判定し、check-in or check-out にディスパッチする。
checkinRoute.post('/scan', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const result = await processScanValue(createDb(c.env), parsed.data.scanValue);
  return c.json(serializeScanResult(result));
});
