import { describe, expect, it } from 'vitest';
import { ATTENDANCE_CAPACITY, classifyAttendanceLevel, occupancyRatio } from './attendance-level';

describe('classifyAttendanceLevel', () => {
  it('0 人は quiet', () => {
    expect(classifyAttendanceLevel(0)).toBe('quiet');
  });

  it('quiet→steady の境界は 7 人', () => {
    expect(classifyAttendanceLevel(6)).toBe('quiet');
    expect(classifyAttendanceLevel(7)).toBe('steady');
  });

  it('steady→lively の境界は 13 人', () => {
    expect(classifyAttendanceLevel(12)).toBe('steady');
    expect(classifyAttendanceLevel(13)).toBe('lively');
  });

  it('lively→crowded の境界は 19 人', () => {
    expect(classifyAttendanceLevel(18)).toBe('lively');
    expect(classifyAttendanceLevel(19)).toBe('crowded');
  });

  it('想定上限の 25 人は crowded', () => {
    expect(classifyAttendanceLevel(25)).toBe('crowded');
  });

  it('負値は 0 と同じ quiet 扱い', () => {
    expect(classifyAttendanceLevel(-5)).toBe('quiet');
  });

  it('端数は切り捨てて判定（12.9→steady）', () => {
    expect(classifyAttendanceLevel(12.9)).toBe('steady');
  });
});

describe('occupancyRatio', () => {
  it('想定上限 25 人で 1（満員）', () => {
    expect(occupancyRatio(25)).toBe(1);
    expect(ATTENDANCE_CAPACITY).toBe(25);
  });

  it('上限を超えても 1 でクランプ', () => {
    expect(occupancyRatio(40)).toBe(1);
  });

  it('0 人で 0', () => {
    expect(occupancyRatio(0)).toBe(0);
  });

  it('半分（約12〜13人）で 0.5 前後', () => {
    expect(occupancyRatio(12.5)).toBeCloseTo(0.5, 5);
  });
});
