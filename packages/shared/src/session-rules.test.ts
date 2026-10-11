import { describe, expect, it } from 'vitest';
import {
  findOverlappingSession,
  SESSION_RULE_MESSAGES,
  type SessionTimes,
  validateSessionTimes,
} from './session-rules';
import { jstDateTimeToInstant as jst } from './venue-schedule';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const NOW = jst(TODAY, '15:00');

const times = (date: string, inTime: string, outTime: string | null): SessionTimes => ({
  checkedInAt: jst(date, inTime),
  checkedOutAt: outTime === null ? null : jst(date, outTime),
});

describe('validateSessionTimes', () => {
  it('過去日の入場〜退場がそろった記録は OK', () => {
    expect(validateSessionTimes(times(PAST, '10:00', '11:00'), NOW)).toBeNull();
  });

  it('退場が入場と同時刻なら CHECKOUT_BEFORE_CHECKIN', () => {
    expect(validateSessionTimes(times(PAST, '10:00', '10:00'), NOW)).toBe(
      'CHECKOUT_BEFORE_CHECKIN',
    );
  });

  it('退場が入場より前なら CHECKOUT_BEFORE_CHECKIN', () => {
    expect(validateSessionTimes(times(PAST, '11:00', '10:00'), NOW)).toBe(
      'CHECKOUT_BEFORE_CHECKIN',
    );
  });

  it('退場が入場と別の JST 日なら SPANS_DAYS', () => {
    const t = { checkedInAt: jst(PAST, '18:00'), checkedOutAt: jst('2026-10-05', '09:00') };
    expect(validateSessionTimes(t, NOW)).toBe('SPANS_DAYS');
  });

  it('入場が現在 + 1 分より後なら FUTURE_TIME', () => {
    const t = { checkedInAt: new Date(NOW.getTime() + 120_000), checkedOutAt: null };
    expect(validateSessionTimes(t, NOW)).toBe('FUTURE_TIME');
  });

  it('入場が現在 + 30 秒（猶予内）なら今日の滞在中として OK', () => {
    const t = { checkedInAt: new Date(NOW.getTime() + 30_000), checkedOutAt: null };
    expect(validateSessionTimes(t, NOW)).toBeNull();
  });

  it('退場が未来なら FUTURE_TIME', () => {
    expect(validateSessionTimes(times(TODAY, '14:00', '15:05'), NOW)).toBe('FUTURE_TIME');
  });

  it('今日の滞在中（退場なし）は OK', () => {
    expect(validateSessionTimes(times(TODAY, '14:00', null), NOW)).toBeNull();
  });

  it('過去日の滞在中は OPEN_SESSION_NOT_TODAY', () => {
    expect(validateSessionTimes(times(PAST, '10:00', null), NOW)).toBe('OPEN_SESSION_NOT_TODAY');
  });
});

describe('findOverlappingSession', () => {
  it('他の記録が無ければ null', () => {
    expect(findOverlappingSession(times(PAST, '10:00', '11:00'), [], NOW)).toBeNull();
  });

  it('時間が重なる記録を返す', () => {
    const sibling = times(PAST, '10:30', '12:00');
    expect(findOverlappingSession(times(PAST, '10:00', '11:00'), [sibling], NOW)).toBe(sibling);
  });

  it('境界で接するだけ（11:00 退場・11:00 入場）は重ならない', () => {
    const sibling = times(PAST, '11:00', '12:00');
    expect(findOverlappingSession(times(PAST, '10:00', '11:00'), [sibling], NOW)).toBeNull();
  });

  it('滞在中の記録は現在時刻まで続くとみなす', () => {
    const sibling = times(TODAY, '13:00', null);
    expect(findOverlappingSession(times(TODAY, '14:00', '14:30'), [sibling], NOW)).toBe(sibling);
  });

  it('滞在中どうしは重なる（同じ子の滞在中が 2 件になるのを防ぐ）', () => {
    const sibling = times(TODAY, '13:00', null);
    expect(findOverlappingSession(times(TODAY, '14:00', null), [sibling], NOW)).toBe(sibling);
  });

  it('猶予内で少し未来の滞在中でも、既存の滞在中と重なる（滞在中が 2 件になるのを防ぐ）', () => {
    const now = new Date(jst(TODAY, '10:30').getTime() + 30_000);
    const sibling = times(TODAY, '09:00', null);
    expect(findOverlappingSession(times(TODAY, '10:31', null), [sibling], now)).toBe(sibling);
  });

  it('滞在中の記録より前に終わった記録とは重ならない', () => {
    const sibling = times(TODAY, '10:00', '11:00');
    expect(findOverlappingSession(times(TODAY, '14:00', null), [sibling], NOW)).toBeNull();
  });
});

describe('SESSION_RULE_MESSAGES', () => {
  it('すべての違反に日本語の文言がある', () => {
    expect(SESSION_RULE_MESSAGES.CHECKOUT_BEFORE_CHECKIN).toBe(
      '退場時刻は入場時刻より後にしてください',
    );
    expect(Object.keys(SESSION_RULE_MESSAGES).sort()).toEqual([
      'CHECKOUT_BEFORE_CHECKIN',
      'FUTURE_TIME',
      'OPEN_SESSION_NOT_TODAY',
      'OVERLAP',
      'SPANS_DAYS',
    ]);
  });
});
