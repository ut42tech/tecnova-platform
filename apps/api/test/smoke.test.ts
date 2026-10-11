import { beforeEach, describe, expect, it } from 'vitest';
import { eventDates, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const db = testDb();

describe('test D1', () => {
  beforeEach(async () => {
    await resetTables(db);
  });

  it('マイグレーション済みのテーブルに書き込める', async () => {
    await seedParticipant(db, '26001');
    await seedSession(db, {
      participantId: '26001',
      date: '2026-10-04',
      inTime: '10:00',
      outTime: '11:00',
    });
    expect(await eventDates(db)).toEqual(['2026-10-04']);
  });

  it('前のテストのデータは resetTables で消えている', async () => {
    expect(await eventDates(db)).toEqual([]);
  });
});
