import { env } from 'cloudflare:workers';
import * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import { jstDateTimeToInstant } from '@tecnova/shared/venue-schedule';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export const testDb = () => drizzle(env.DB, { schema });
export type TestDb = ReturnType<typeof testDb>;

export const jst = (date: string, time: string): Date => jstDateTimeToInstant(date, time);

// D1 のデータがテスト間でリセットされるかは公式に明記されていないため、各テストの前に明示的に空にする。
// sessions は participants / events を FK で参照するので子テーブルから消す。
export const resetTables = async (db: TestDb): Promise<void> => {
  await db.delete(sessions);
  await db.delete(events);
  await db.delete(participants);
};

// Public リポジトリのため、氏名・ニックネームは実在しない値にする。
export const seedParticipant = async (db: TestDb, id: string, active = true): Promise<void> => {
  await db.insert(participants).values({
    id,
    preRegistrationId: `PRE-TEST-${id}`,
    fullName: `テスト${id}`,
    nickname: `nick${id}`,
    grade: '小3',
    active,
  });
};

// 受付経路を通さずに既存データ（過去日の滞在中など）を再現するため、DB へ直接入れる。
export const seedSession = async (
  db: TestDb,
  input: { participantId: string; date: string; inTime: string; outTime: string | null },
): Promise<string> => {
  await db.insert(events).values({ date: input.date }).onConflictDoNothing();
  const [event] = await db.select().from(events).where(eq(events.date, input.date)).limit(1);
  if (!event) throw new Error(`failed to seed event ${input.date}`);
  const id = crypto.randomUUID();
  await db.insert(sessions).values({
    id,
    participantId: input.participantId,
    eventId: event.id,
    checkedInAt: jst(input.date, input.inTime),
    checkedOutAt: input.outTime === null ? null : jst(input.date, input.outTime),
  });
  return id;
};

export const eventDates = async (db: TestDb): Promise<string[]> =>
  (await db.select({ date: events.date }).from(events)).map((e) => e.date).sort();
