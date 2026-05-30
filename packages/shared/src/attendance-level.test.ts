import { describe, expect, it } from 'vitest';
import { classifyAttendanceLevel } from './attendance-level';

describe('classifyAttendanceLevel', () => {
  it('0 人は quiet', () => {
    expect(classifyAttendanceLevel(0)).toBe('quiet');
  });

  it('quiet→steady の境界は 8 人', () => {
    expect(classifyAttendanceLevel(7)).toBe('quiet');
    expect(classifyAttendanceLevel(8)).toBe('steady');
  });

  it('steady→lively の境界は 18 人', () => {
    expect(classifyAttendanceLevel(17)).toBe('steady');
    expect(classifyAttendanceLevel(18)).toBe('lively');
  });

  it('lively→crowded の境界は 30 人', () => {
    expect(classifyAttendanceLevel(29)).toBe('lively');
    expect(classifyAttendanceLevel(30)).toBe('crowded');
  });

  it('負値は 0 と同じ quiet 扱い', () => {
    expect(classifyAttendanceLevel(-5)).toBe('quiet');
  });

  it('端数は切り捨てて判定（12.9→steady）', () => {
    expect(classifyAttendanceLevel(12.9)).toBe('steady');
  });
});
