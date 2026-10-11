import { describe, expect, it } from 'vitest';
import { createSessionRequestSchema, updateSessionRequestSchema } from './admin';

describe('createSessionRequestSchema', () => {
  it('5 桁の ID と ISO 時刻を受け付ける（退場は null 可）', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '26001',
      checkedInAt: '2026-10-04T01:05:00.000Z',
      checkedOutAt: null,
    });
    expect(r.success).toBe(true);
  });

  it('5 桁でない ID は弾く', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '2601',
      checkedInAt: '2026-10-04T01:05:00.000Z',
      checkedOutAt: null,
    });
    expect(r.success).toBe(false);
  });

  it('ISO でない時刻は弾く', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '26001',
      checkedInAt: '2026-10-04 10:05',
      checkedOutAt: null,
    });
    expect(r.success).toBe(false);
  });
});

describe('来場時刻の下限', () => {
  it('2020 年より前の時刻は弾く（年の打ち間違いで 1926 年などの開催日を作らない）', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '26001',
      checkedInAt: '1926-10-11T01:05:00.000Z',
      checkedOutAt: null,
    });
    expect(r.success).toBe(false);
    expect(updateSessionRequestSchema.safeParse({ checkedOutAt: '0999-10-11T01:05:00.000Z' }).success).toBe(false);
  });
});

describe('updateSessionRequestSchema', () => {
  it('項目が 1 つも無いと弾く', () => {
    expect(updateSessionRequestSchema.safeParse({}).success).toBe(false);
  });

  it('checkedOutAt: null だけでも受け付ける（滞在中に戻す）', () => {
    expect(updateSessionRequestSchema.safeParse({ checkedOutAt: null }).success).toBe(true);
  });

  it('付け替え（participantId だけ）を受け付ける', () => {
    expect(updateSessionRequestSchema.safeParse({ participantId: '26002' }).success).toBe(true);
  });
});
