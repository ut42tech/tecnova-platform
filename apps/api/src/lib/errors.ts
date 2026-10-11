import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { MentorError, type MentorErrorCode } from './admin';
import { CheckinError, type CheckinErrorCode } from './checkin';
import { PreRegistrationError, type PreRegistrationErrorCode } from './pre-registrations';
import { SessionError, type SessionErrorCode } from './session-admin';

export const invalidBodyError = { error: 'INTERNAL' as const, message: 'invalid request body' };
export const invalidQueryError = {
  error: 'INTERNAL' as const,
  message: 'invalid query parameters',
};

const internalError = (e: unknown) => ({
  error: 'INTERNAL' as const,
  message: e instanceof Error ? e.message : String(e),
});

const mentorErrorStatus: Record<MentorErrorCode, ContentfulStatusCode> = {
  EMAIL_ALREADY_EXISTS: 409,
  NOT_FOUND: 404,
};

const preRegistrationErrorStatus: Record<PreRegistrationErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  ALREADY_ACTIVATED: 409,
  SHEETS_WRITE_FAILED: 502,
};

const checkinErrorStatus: Record<CheckinErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  INVALID_SCAN_VALUE: 400,
  ALREADY_ACTIVATED: 409,
  ALREADY_CHECKED_IN: 409,
  NOT_CHECKED_IN: 409,
  SHEETS_WRITE_FAILED: 502,
};

const sessionErrorStatus: Record<SessionErrorCode, ContentfulStatusCode> = {
  SESSION_NOT_FOUND: 404,
  PARTICIPANT_NOT_FOUND: 404,
  CHECKOUT_BEFORE_CHECKIN: 400,
  SPANS_DAYS: 400,
  FUTURE_TIME: 400,
  OPEN_SESSION_NOT_TODAY: 400,
  OVERLAP: 409,
};

// ドメインエラーを HTTP ステータス + JSON にマップして返す Hono の onError ハンドラ。
// 未知のエラーは 500 INTERNAL に丸める。各ルートで try/catch を書かずに済むよう
// app.onError(apiErrorHandler) で一括登録して使う。
export const apiErrorHandler: ErrorHandler = (e, c) => {
  if (e instanceof CheckinError) {
    return c.json({ error: e.code, message: e.message }, checkinErrorStatus[e.code]);
  }
  if (e instanceof MentorError) {
    return c.json({ error: e.code, message: e.message }, mentorErrorStatus[e.code]);
  }
  if (e instanceof PreRegistrationError) {
    return c.json({ error: e.code, message: e.message }, preRegistrationErrorStatus[e.code]);
  }
  if (e instanceof SessionError) {
    return c.json({ error: e.code, message: e.message }, sessionErrorStatus[e.code]);
  }
  return c.json(internalError(e), 500);
};
