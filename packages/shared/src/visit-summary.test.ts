import { describe, expect, it } from 'vitest';
import { summarizeStays } from './visit-summary';

const min = 60_000;
const stay = (participantId: string, inMin: number, outMin: number | null) => ({
  participantId,
  checkedInAt: inMin * min,
  checkedOutAt: outMin === null ? null : outMin * min,
});

describe('summarizeStays', () => {
  it('空配列は count 0・平均 null', () => {
    expect(summarizeStays([])).toEqual({ count: 0, averageStayMinutes: null });
  });

  it('count はユニーク参加者数（同一人物の複数セッションは1人）', () => {
    // 退館→再入館で2行になっても1人。
    const r = summarizeStays([stay('p1', 0, 30), stay('p1', 60, 90), stay('p2', 0, 30)]);
    expect(r.count).toBe(2);
  });

  it('平均滞在は1人あたり（同一人物の複数区間は合算してから平均）', () => {
    // p1: 30+30=60分, p2: 20分 → (60+20)/2 = 40
    const r = summarizeStays([stay('p1', 0, 30), stay('p1', 60, 90), stay('p2', 0, 20)]);
    expect(r.averageStayMinutes).toBe(40);
  });

  it('未退館は人数に数えるが滞在平均には含めない', () => {
    expect(summarizeStays([stay('p1', 0, null)])).toEqual({ count: 1, averageStayMinutes: null });
  });

  it('退館 < 入館 の不正区間は滞在から除外（人数には数える）', () => {
    const r = summarizeStays([stay('p1', 100, 50), stay('p2', 0, 40)]);
    expect(r.count).toBe(2);
    expect(r.averageStayMinutes).toBe(40);
  });

  it('平均は分に四捨五入', () => {
    const r = summarizeStays([{ participantId: 'p1', checkedInAt: 0, checkedOutAt: 90_000 }]);
    expect(r.averageStayMinutes).toBe(2);
  });
});
