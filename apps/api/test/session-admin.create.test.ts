import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionByAdmin } from '../src/lib/session-admin';
import { eventDates, jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const NOW = jst(TODAY, '15:00');
const db = testDb();

const input = (participantId: string, date: string, inTime: string, outTime: string | null) => ({
  participantId,
  checkedInAt: jst(date, inTime).toISOString(),
  checkedOutAt: outTime === null ? null : jst(date, outTime).toISOString(),
});

describe('createSessionByAdmin', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
    await seedParticipant(db, '26002');
  });

  it('開催日が無い日に追加すると開催日を作り、記録を返す', async () => {
    const r = await createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW);
    expect(r.eventDate).toBe(PAST);
    expect(r.session).toMatchObject({
      participantId: '26001',
      checkedInAt: jst(PAST, '10:00').toISOString(),
      checkedOutAt: jst(PAST, '11:00').toISOString(),
      isPresent: false,
      term: 'morning',
      counted: true,
    });
    expect(await eventDates(db)).toEqual([PAST]);
  });

  it('既存の開催日を再利用する', async () => {
    await seedSession(db, {
      participantId: '26002',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW);
    expect(await eventDates(db)).toEqual([PAST]);
  });

  it('JST の早朝（UTC では前日）の記録も JST の日付の開催日に入る', async () => {
    const r = await createSessionByAdmin(db, input('26001', PAST, '08:30', '08:50'), NOW);
    expect(r.eventDate).toBe(PAST);
  });

  it('存在しない子は PARTICIPANT_NOT_FOUND', async () => {
    await expect(
      createSessionByAdmin(db, input('26999', PAST, '10:00', '11:00'), NOW),
    ).rejects.toMatchObject({ name: 'SessionError', code: 'PARTICIPANT_NOT_FOUND' });
  });

  it('無効化した子にも追加できる', async () => {
    await seedParticipant(db, '26003', false);
    const r = await createSessionByAdmin(db, input('26003', PAST, '10:00', '11:00'), NOW);
    expect(r.session.participantId).toBe('26003');
  });

  it('同じ子・同じ日の記録と重なると OVERLAP', async () => {
    await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:30',
      outTime: '12:00',
    });
    await expect(
      createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW),
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });

  it('別の子の記録とは重なってもよい', async () => {
    await seedSession(db, {
      participantId: '26002',
      date: PAST,
      inTime: '10:30',
      outTime: '12:00',
    });
    const r = await createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW);
    expect(r.session.participantId).toBe('26001');
  });

  it('過去日の滞在中は OPEN_SESSION_NOT_TODAY', async () => {
    await expect(
      createSessionByAdmin(db, input('26001', PAST, '10:00', null), NOW),
    ).rejects.toMatchObject({ code: 'OPEN_SESSION_NOT_TODAY' });
  });

  it('今日の滞在中は追加できる', async () => {
    const r = await createSessionByAdmin(db, input('26001', TODAY, '14:00', null), NOW);
    expect(r.session.isPresent).toBe(true);
    expect(r.eventDate).toBe(TODAY);
  });

  it('未来の時刻は FUTURE_TIME', async () => {
    await expect(
      createSessionByAdmin(db, input('26001', TODAY, '16:00', null), NOW),
    ).rejects.toMatchObject({ code: 'FUTURE_TIME' });
  });

  it('検証エラーのときは開催日を作らない', async () => {
    await expect(
      createSessionByAdmin(db, input('26001', PAST, '11:00', '10:00'), NOW),
    ).rejects.toMatchObject({ code: 'CHECKOUT_BEFORE_CHECKIN' });
    expect(await eventDates(db)).toEqual([]);
  });
});
