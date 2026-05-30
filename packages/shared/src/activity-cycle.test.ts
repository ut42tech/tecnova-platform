import { describe, expect, it } from 'vitest';
import {
  classifyCycleMoment,
  cycleChimeEventsForDay,
  msUntilNextBoundary,
} from './activity-cycle';

// JST 指定の instant を作るヘルパ（Asia/Tokyo は固定 UTC+9）。
const jst = (iso: string): Date => new Date(`${iso}+09:00`);

describe('classifyCycleMoment', () => {
  it('活動中（朝・サイクル1）', () => {
    const m = classifyCycleMoment(jst('2026-05-30T09:30:00'));
    expect(m.phase).toBe('activity');
    expect(m.term).toBe('morning');
    expect(m.cycleIndex).toBe(1);
    expect(m.phaseEndsAt?.toISOString()).toBe(jst('2026-05-30T09:50:00').toISOString());
  });

  it(':50 ちょうどは休憩', () => {
    const m = classifyCycleMoment(jst('2026-05-30T09:50:00'));
    expect(m.phase).toBe('break');
    expect(m.phaseEndsAt?.toISOString()).toBe(jst('2026-05-30T10:00:00').toISOString());
  });

  it('サイクル3の活動（朝 11:30）', () => {
    const m = classifyCycleMoment(jst('2026-05-30T11:30:00'));
    expect(m.phase).toBe('activity');
    expect(m.cycleIndex).toBe(3);
    expect(m.phaseEndsAt?.toISOString()).toBe(jst('2026-05-30T11:50:00').toISOString());
  });

  it('昼休みは idle', () => {
    const m = classifyCycleMoment(jst('2026-05-30T12:30:00'));
    expect(m.phase).toBe('idle');
    expect(m.term).toBeNull();
    expect(m.phaseEndsAt).toBeNull();
  });

  it('開始前は idle', () => {
    expect(classifyCycleMoment(jst('2026-05-30T08:00:00')).phase).toBe('idle');
  });

  it('夕方ターム内', () => {
    expect(classifyCycleMoment(jst('2026-05-30T16:30:00')).term).toBe('evening');
  });
});

describe('cycleChimeEventsForDay', () => {
  it('1日分は 3ターム×7 = 21 イベント', () => {
    expect(cycleChimeEventsForDay(jst('2026-05-30T09:00:00'))).toHaveLength(21);
  });

  it('時系列順に並ぶ', () => {
    const ev = cycleChimeEventsForDay(jst('2026-05-30T09:00:00'));
    const ts = ev.map((e) => e.at.getTime());
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it('朝タームの最初の3イベントは resume@9:00 / break@9:50 / resume@10:00', () => {
    const ev = cycleChimeEventsForDay(jst('2026-05-30T09:00:00')).filter((e) => e.term === 'morning');
    expect(ev[0]).toMatchObject({ kind: 'resume', at: jst('2026-05-30T09:00:00') });
    expect(ev[1]).toMatchObject({ kind: 'break', at: jst('2026-05-30T09:50:00') });
    expect(ev[2]).toMatchObject({ kind: 'resume', at: jst('2026-05-30T10:00:00') });
    expect(ev.at(-1)).toMatchObject({ kind: 'term-end', at: jst('2026-05-30T12:00:00') });
  });

  it('key は安定（日付#term#kind#HH:mm）', () => {
    const ev = cycleChimeEventsForDay(jst('2026-05-30T09:00:00')).find(
      (e) => e.term === 'morning' && e.kind === 'break',
    );
    expect(ev?.key).toBe('2026-05-30#morning#break#09:50');
  });
});

describe('msUntilNextBoundary', () => {
  it('09:30 の次境界は 09:50（20分後）', () => {
    expect(msUntilNextBoundary(jst('2026-05-30T09:30:00'))).toBe(20 * 60 * 1000);
  });

  it('営業終了後は null', () => {
    expect(msUntilNextBoundary(jst('2026-05-30T20:00:00'))).toBeNull();
  });
});
