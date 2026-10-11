import { beforeEach, describe, expect, it } from 'vitest';
import { updateSessionByAdmin } from '../src/lib/session-admin';
import { eventDates, jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const OTHER_PAST = '2026-10-05';
const NOW = jst(TODAY, '15:00');
const db = testDb();
const iso = (date: string, time: string) => jst(date, time).toISOString();

describe('updateSessionByAdmin', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
    await seedParticipant(db, '26002');
    await seedParticipant(db, '26003');
  });

  it('同じ日のまま退場時刻を直せる（自分自身とは重ならない扱い）', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    const r = await updateSessionByAdmin(db, id, { checkedOutAt: iso(PAST, '11:30') }, NOW);
    expect(r.session.checkedOutAt).toBe(iso(PAST, '11:30'));
    expect(r.eventDate).toBe(PAST);
  });

  it('日付を変えると別の開催日へ移り、空になった過去の開催日は消える', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    const r = await updateSessionByAdmin(
      db,
      id,
      { checkedInAt: iso(OTHER_PAST, '10:00'), checkedOutAt: iso(OTHER_PAST, '11:00') },
      NOW,
    );
    expect(r.eventDate).toBe(OTHER_PAST);
    expect(await eventDates(db)).toEqual([OTHER_PAST]);
  });

  it('元の開催日に他の記録が残っていれば消さない', async () => {
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
    await updateSessionByAdmin(
      db,
      id,
      { checkedInAt: iso(OTHER_PAST, '10:00'), checkedOutAt: iso(OTHER_PAST, '11:00') },
      NOW,
    );
    expect(await eventDates(db)).toEqual([PAST, OTHER_PAST]);
  });

  it('今日の開催日は空になっても残す', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: TODAY,
      inTime: '10:00',
      outTime: '11:00',
    });
    await updateSessionByAdmin(
      db,
      id,
      { checkedInAt: iso(PAST, '10:00'), checkedOutAt: iso(PAST, '11:00') },
      NOW,
    );
    expect(await eventDates(db)).toEqual([PAST, TODAY]);
  });

  it('付け替え先の子の記録と重なると OVERLAP', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await seedSession(db, {
      participantId: '26002',
      date: PAST,
      inTime: '10:30',
      outTime: '12:00',
    });
    await expect(
      updateSessionByAdmin(db, id, { participantId: '26002' }, NOW),
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });

  it('重ならない子へは付け替えられる', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    const r = await updateSessionByAdmin(db, id, { participantId: '26003' }, NOW);
    expect(r.session.participantId).toBe('26003');
    expect(r.session.nickname).toBe('nick26003');
  });

  it('存在しない子への付け替えは PARTICIPANT_NOT_FOUND', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await expect(
      updateSessionByAdmin(db, id, { participantId: '26999' }, NOW),
    ).rejects.toMatchObject({ code: 'PARTICIPANT_NOT_FOUND' });
  });

  it('今日の記録は滞在中に戻せる', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: TODAY,
      inTime: '10:00',
      outTime: '11:00',
    });
    const r = await updateSessionByAdmin(db, id, { checkedOutAt: null }, NOW);
    expect(r.session.isPresent).toBe(true);
  });

  it('過去日の記録を滞在中に戻すのは OPEN_SESSION_NOT_TODAY', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: '11:00',
    });
    await expect(updateSessionByAdmin(db, id, { checkedOutAt: null }, NOW)).rejects.toMatchObject({
      code: 'OPEN_SESSION_NOT_TODAY',
    });
  });

  it('過去日に滞在中のまま残った記録は、退場時刻を入れずに直そうとすると止まり、入れれば直る', async () => {
    const id = await seedSession(db, {
      participantId: '26001',
      date: PAST,
      inTime: '10:00',
      outTime: null,
    });
    await expect(
      updateSessionByAdmin(db, id, { checkedInAt: iso(PAST, '10:15') }, NOW),
    ).rejects.toMatchObject({ code: 'OPEN_SESSION_NOT_TODAY' });
    const r = await updateSessionByAdmin(db, id, { checkedOutAt: iso(PAST, '11:00') }, NOW);
    expect(r.session.isPresent).toBe(false);
  });

  it('存在しない記録は SESSION_NOT_FOUND', async () => {
    await expect(
      updateSessionByAdmin(db, 'no-such-session', { checkedOutAt: null }, NOW),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});
