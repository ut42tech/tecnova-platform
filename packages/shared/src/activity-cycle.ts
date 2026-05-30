// 活動50分・休憩10分のリズムを壁時計の「時」に合わせて刻む純粋ロジック。
// 各タームを 50+10=60分 × 3サイクルに割る（3時間タームをちょうど割り切る）。
// venue-schedule と同じく Workers 安全（Intl のみ・Node API なし）、JST 固定 UTC+9。
import { TERMS, type TermId, toJstDateString, toJstWallClock } from './venue-schedule';

export const ACTIVITY_MINUTES = 50;
export const BREAK_MINUTES = 10;
const CYCLE_MINUTES = ACTIVITY_MINUTES + BREAK_MINUTES; // 60

// Asia/Tokyo は DST が無く固定 UTC+9（venue-schedule と同前提）。
const JST_OFFSET_HOURS = 9;

// 'HH:mm' を 0:00 からの通算分に。venue-schedule の同名ヘルパは非公開のため再宣言。
const toMinutesOfDay = (hhmm: string): number =>
  Number.parseInt(hhmm.slice(0, 2), 10) * 60 + Number.parseInt(hhmm.slice(3, 5), 10);

const jstMinuteOfDay = (instant: Date): number => {
  const { hour, minute } = toJstWallClock(instant);
  return hour * 60 + minute;
};

// ref の JST 暦日における JST 通算分 minuteOfDay を UTC instant に変換（termEndInstant と同手法）。
const jstInstantOnDayOf = (ref: Date, minuteOfDay: number): Date => {
  const { year, month, day } = toJstWallClock(ref);
  const hh = Math.floor(minuteOfDay / 60);
  const mm = minuteOfDay % 60;
  return new Date(Date.UTC(year, month - 1, day, hh - JST_OFFSET_HOURS, mm, 0, 0));
};

export type CyclePhase = 'activity' | 'break' | 'idle';

export interface CycleMoment {
  phase: CyclePhase;
  term: TermId | null;
  cycleIndex: number | null; // 1..3、idle のとき null
  phaseEndsAt: Date | null; // 現フェーズ終端（次の境界）、idle のとき null
}

export type ChimeKind = 'resume' | 'break' | 'term-end';

export interface ChimeEvent {
  kind: ChimeKind;
  term: TermId;
  at: Date;
  key: string; // dedup 用安定キー `${date}#${term}#${kind}#${HH:mm}`
}

// 瞬間を活動/休憩/idle に分類し、現フェーズの終端 instant も返す。
export const classifyCycleMoment = (instant: Date): CycleMoment => {
  const current = jstMinuteOfDay(instant);
  for (const term of TERMS) {
    const start = toMinutesOfDay(term.start);
    const end = toMinutesOfDay(term.end);
    if (current >= start && current < end) {
      const offset = current - start; // 0..179
      const cycleIndex = Math.floor(offset / CYCLE_MINUTES) + 1;
      const withinCycle = offset % CYCLE_MINUTES;
      const phase: CyclePhase = withinCycle < ACTIVITY_MINUTES ? 'activity' : 'break';
      const cycleStart = start + (cycleIndex - 1) * CYCLE_MINUTES;
      const boundaryMinute =
        phase === 'activity' ? cycleStart + ACTIVITY_MINUTES : cycleStart + CYCLE_MINUTES;
      return {
        phase,
        term: term.id,
        cycleIndex,
        phaseEndsAt: jstInstantOnDayOf(instant, boundaryMinute),
      };
    }
  }
  return { phase: 'idle', term: null, cycleIndex: null, phaseEndsAt: null };
};

// instant の JST 暦日における全タームのチャイムイベントを時系列順で返す。
// クライアントは tick ごとに「前回 < at <= 今」で境界跨ぎを検出し key で dedup する。
export const cycleChimeEventsForDay = (instant: Date): ChimeEvent[] => {
  const date = toJstDateString(instant);
  const events: ChimeEvent[] = [];
  const push = (kind: ChimeKind, term: TermId, minuteOfDay: number): void => {
    const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
    const mm = String(minuteOfDay % 60).padStart(2, '0');
    events.push({
      kind,
      term,
      at: jstInstantOnDayOf(instant, minuteOfDay),
      key: `${date}#${term}#${kind}#${hh}:${mm}`,
    });
  };
  for (const term of TERMS) {
    const start = toMinutesOfDay(term.start);
    const end = toMinutesOfDay(term.end);
    const cycles = Math.round((end - start) / CYCLE_MINUTES);
    for (let n = 0; n < cycles; n += 1) {
      push('resume', term.id, start + n * CYCLE_MINUTES);
      push('break', term.id, start + n * CYCLE_MINUTES + ACTIVITY_MINUTES);
    }
    push('term-end', term.id, end);
  }
  return events;
};

// 次の境界までのミリ秒。その日もう境界が無ければ null。
export const msUntilNextBoundary = (instant: Date): number | null => {
  const now = instant.getTime();
  const future = cycleChimeEventsForDay(instant)
    .map((e) => e.at.getTime())
    .filter((t) => t > now)
    .sort((a, b) => a - b);
  const next = future[0];
  return next === undefined ? null : next - now;
};

// 秒丸め（ceil で 0 秒の一瞬を避ける）。
export const secondsUntilNextBoundary = (instant: Date): number | null => {
  const ms = msUntilNextBoundary(instant);
  return ms === null ? null : Math.ceil(ms / 1000);
};
