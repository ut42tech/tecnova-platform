import { SESSION_RULE_MESSAGES, type SessionRuleViolation } from '@tecnova/shared/session-rules';
import { ApiError, apiErrorMessage } from '@tecnova/ui/lib/api-client';

const isRuleViolation = (code: unknown): code is SessionRuleViolation =>
  typeof code === 'string' && Object.hasOwn(SESSION_RULE_MESSAGES, code);

// API の SessionError（{ error: code, message }）を画面の文言にする。ルール違反は画面側の検証と
// 同じ shared の文言にそろえ、それ以外（記録が無い等）は API の message をそのまま使う。
export const sessionErrorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    const code = (e.body as { error?: unknown } | undefined)?.error;
    if (isRuleViolation(code)) return SESSION_RULE_MESSAGES[code];
  }
  return apiErrorMessage(e);
};
