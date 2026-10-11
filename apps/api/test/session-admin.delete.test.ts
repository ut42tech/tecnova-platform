import { sessions } from '@tecnova/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSessionByAdmin } from '../src/lib/session-admin';
import { eventDates, jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const NOW = jst(TODAY, '15:00');
const db = testDb();

const sessionCount = async () => (await db.select({ id: sessions.id }).from(sessions)).length;

describe('deleteSessionByAdmin', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
    await seedParticipant(db, '26002');
  });

  it('記録を消し、他の記録が残る開催日は残す', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await seedSession(db, {
      participantId: '26002',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await deleteSessionByAdmin(db, id, NOW);
    expect(await sessionCount()).toBe(1);
    expect(await eventDates(db)).toEqual([PAST]);
  });

  it('過去の開催日の最後の 1 件を消すと開催日も消える', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await deleteSessionByAdmin(db, id, NOW);
    expect(await eventDates(db)).toEqual([]);
  });

  it('今日の開催日は空になっても残す', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: TODAY,
      inTime: '10:00',
      outTime: '11:00',
    });
    await deleteSessionByAdmin(db, id, NOW);
    expect(await eventDates(db)).toEqual([TODAY]);
  });

  it('存在しない記録は SESSION_NOT_FOUND', async () => {
    await expect(deleteSessionByAdmin(db, 'no-such-session', NOW)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });
});
