import { describe, expect, it } from 'vitest';
import { jstDateTimeToInstant, toJstDateString, toJstTimeString } from './venue-schedule';

describe('jstDateTimeToInstant', () => {
  it('JST の日付と時刻を UTC instant にする（UTC+9）', () => {
    expect(jstDateTimeToInstant('2026-10-11', '10:05').toISOString()).toBe(
      '2026-10-11T01:05:00.000Z',
    );
  });

  it('JST の早朝は UTC では前日になる', () => {
    expect(jstDateTimeToInstant('2026-10-11', '08:30').toISOString()).toBe(
      '2026-10-10T23:30:00.000Z',
    );
  });

  it('変換した instant を JST 日付に戻すと元の日付になる（深夜 0 時台）', () => {
    expect(toJstDateString(jstDateTimeToInstant('2026-10-11', '00:10'))).toBe('2026-10-11');
  });
});

describe('toJstTimeString', () => {
  it('UTC instant を JST の HH:mm にする', () => {
    expect(toJstTimeString(new Date('2026-10-10T23:30:00.000Z'))).toBe('08:30');
  });

  it('1 桁の時・分は 0 埋めする', () => {
    expect(toJstTimeString(new Date('2026-10-11T00:05:00.000Z'))).toBe('09:05');
  });
});
