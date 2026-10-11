import { toJstDateString } from './venue-schedule';

// 管理画面からの来場記録の追加・編集で守るルール。DB に制約（CHECK・一意制約）が無いため、
// API（apps/api/src/lib/session-admin.ts）と画面（SessionFormDialog）の両方がこの純粋関数で検証する。
// 設計: docs/superpowers/specs/2026-10-11-checkin-record-correction-design.md §2

export type SessionRuleViolation =
  | 'CHECKOUT_BEFORE_CHECKIN'
  | 'SPANS_DAYS'
  | 'FUTURE_TIME'
  | 'OPEN_SESSION_NOT_TODAY'
  | 'OVERLAP';

export interface SessionTimes {
  checkedInAt: Date;
  // null = 滞在中（まだ退場していない）
  checkedOutAt: Date | null;
}

// 端末の時計ずれで「今」入力した時刻が未来扱いにならないための猶予。
export const FUTURE_TOLERANCE_MS = 60_000;

// 時刻だけで判定できるルール（重なり以外）を検証する。違反が無ければ null。
export const validateSessionTimes = (
  times: SessionTimes,
  now: Date,
): Exclude<SessionRuleViolation, 'OVERLAP'> | null => {
  const limit = now.getTime() + FUTURE_TOLERANCE_MS;
  if (times.checkedInAt.getTime() > limit) return 'FUTURE_TIME';
  if (times.checkedOutAt !== null && times.checkedOutAt.getTime() > limit) return 'FUTURE_TIME';

  if (times.checkedOutAt !== null) {
    if (times.checkedOutAt.getTime() <= times.checkedInAt.getTime()) {
      return 'CHECKOUT_BEFORE_CHECKIN';
    }
    // 参加回数の集計は「開催日 = 入場日」で行うため、日をまたぐ記録は作らない。
    if (toJstDateString(times.checkedOutAt) !== toJstDateString(times.checkedInAt)) {
      return 'SPANS_DAYS';
    }
    return null;
  }

  // 過去日に滞在中の記録が残ると、その日の一覧で「来場中」と表示され続けるため今日だけに許す。
  if (toJstDateString(times.checkedInAt) !== toJstDateString(now)) {
    return 'OPEN_SESSION_NOT_TODAY';
  }
  return null;
};

// 区間 [入場, 退場) の終端。滞在中は「今」まで続いているとみなす。
const intervalEnd = (times: SessionTimes, now: Date): number =>
  Math.max(times.checkedInAt.getTime(), (times.checkedOutAt ?? now).getTime());

// 同じ子・同じ日の他の記録（siblings）のうち、target と時間が重なるものを 1 件返す。
// 境界で接する（11:00 退場・11:00 入場）のは重ならない扱い。
export const findOverlappingSession = <T extends SessionTimes>(
  target: SessionTimes,
  siblings: readonly T[],
  now: Date,
): T | null => {
  const start = target.checkedInAt.getTime();
  const end = intervalEnd(target, now);
  return siblings.find((s) => start < intervalEnd(s, now) && s.checkedInAt.getTime() < end) ?? null;
};

// 画面と API のエラー文言をそろえるため、違反ごとの日本語をここに集約する。
export const SESSION_RULE_MESSAGES: Record<SessionRuleViolation, string> = {
  CHECKOUT_BEFORE_CHECKIN: '退場時刻は入場時刻より後にしてください',
  SPANS_DAYS: '入場と退場は同じ日の時刻にしてください',
  FUTURE_TIME: '未来の時刻は入力できません',
  OPEN_SESSION_NOT_TODAY: '過去の日の記録には退場時刻が必要です',
  OVERLAP: '同じ子の同じ日の別の記録と時間が重なっています',
};
