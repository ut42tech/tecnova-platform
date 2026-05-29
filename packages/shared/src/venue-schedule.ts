// 会場の開催タイム（ターム）定義と、参加回数カウントの純粋ロジック。
// API（Cloudflare Workers）とフロント（Next.js）の両方から使うため packages/shared に置く。
// Node 専用 API は使わず Intl のみ（Workers 制約）。日本は DST が無く Asia/Tokyo は
// 固定 UTC+9 のため、JST 壁時計 ↔ UTC instant の変換は単純な時差減算で正しく行える。

export type TermId = 'morning' | 'afternoon' | 'evening';

export interface TermDefinition {
  id: TermId;
  label: string;
  // JST の壁時計 'HH:mm'。start は含み、end は含まない（半開区間 [start, end)）。
  start: string;
  end: string;
}

// 平日（主に木）= evening の1ターム。土日 = morning + afternoon の2ターム。
// 12:00–13:00 はどのタームにも属さない昼休み。16:00 は afternoon の外（end 排他）かつ
// evening の内（start 包含）。両者は曜日で排他なので実運用の衝突は起きない。
export const TERMS: readonly TermDefinition[] = [
  { id: 'morning', label: '朝', start: '09:00', end: '12:00' },
  { id: 'afternoon', label: '昼', start: '13:00', end: '16:00' },
  { id: 'evening', label: '夕方', start: '16:00', end: '19:00' },
];

export const TERM_LABELS: Record<TermId, string> = {
  morning: '朝',
  afternoon: '昼',
  evening: '夕方',
};

// タームの終了まで残りがこの分数未満で来場した場合は参加回数に数えない（30分ルール）。
export const MIN_COUNTING_MINUTES = 30;

// Asia/Tokyo は DST が無く固定 UTC+9。
const JST_OFFSET_HOURS = 9;

export interface JstWallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

const jstFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// UTC instant を JST の壁時計（年月日時分）に分解する。
export const toJstWallClock = (instant: Date): JstWallClock => {
  const parts = jstFormatter.formatToParts(instant);
  const read = (type: 'year' | 'month' | 'day' | 'hour' | 'minute'): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number.parseInt(value, 10);
  };
  // hour12:false でも実装によっては深夜を '24' で返すため 0 に正規化する。
  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
  };
};

// JST 暦日専用フォーマッタ。en-CA ロケールは 'YYYY-MM-DD' を直接返す。
const jstDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// UTC instant を JST の暦日 'YYYY-MM-DD' に整形する（events.date と同形）。
// 「今日（JST）」が欲しいときは現在時刻を渡す。API・フロント双方の JST 日付判定を一本化する。
// 日付は en-CA フォーマッタから直接得る（壁時計の hour 正規化と独立させ、日跨ぎでも安全）。
export const toJstDateString = (instant: Date): string => jstDateFormatter.format(instant);

// 'HH:mm' を 0:00 からの通算分に変換する。区間判定を整数比較に落とすためのヘルパ。
const toMinutesOfDay = (hhmm: string): number =>
  Number.parseInt(hhmm.slice(0, 2), 10) * 60 + Number.parseInt(hhmm.slice(3, 5), 10);

// 来場時刻（instant）が JST 壁時計でどのタームの [start, end) に入るか。
// どのタームにも属さなければ null（昼休み・営業時間外）。
export const classifyTerm = (instant: Date): TermId | null => {
  const { hour, minute } = toJstWallClock(instant);
  const current = hour * 60 + minute;
  for (const term of TERMS) {
    if (current >= toMinutesOfDay(term.start) && current < toMinutesOfDay(term.end)) {
      return term.id;
    }
  }
  return null;
};

const findTerm = (id: TermId): TermDefinition => {
  const term = TERMS.find((candidate) => candidate.id === id);
  if (!term) throw new Error(`unknown term id: ${id}`); // TERMS は網羅的なので実際には到達しない
  return term;
};

// instant が属する JST カレンダー日における、指定タームの終了時刻を UTC instant で返す。
// UTC+9 固定なので JST の終了「時」から 9 を引けば UTC の時になる（Date.UTC が日跨ぎを正規化）。
export const termEndInstant = (instant: Date, id: TermId): Date => {
  const { year, month, day } = toJstWallClock(instant);
  const { end } = findTerm(id);
  const endHour = Number.parseInt(end.slice(0, 2), 10);
  const endMinute = Number.parseInt(end.slice(3, 5), 10);
  return new Date(Date.UTC(year, month - 1, day, endHour - JST_OFFSET_HOURS, endMinute, 0, 0));
};

export interface VisitClassification {
  // 来場時刻が属するターム。営業時間外・昼休みは null。
  term: TermId | null;
  // 30分ルールを満たし参加回数に数えるか。term が null のときは必ず false。
  counted: boolean;
}

// 来場時刻から「ターム」と「参加回数に数えるか」を一度の走査で判定する。
// term と counted の両方が要る箇所はこれを使い、classifyTerm の二度呼びを避ける。
export const classifyVisit = (instant: Date): VisitClassification => {
  const term = classifyTerm(instant);
  if (term === null) return { term: null, counted: false };
  const remainingMs = termEndInstant(instant, term).getTime() - instant.getTime();
  return { term, counted: remainingMs >= MIN_COUNTING_MINUTES * 60_000 };
};

// この来場が参加回数に数えられるか。ターム内であり、かつそのタームの終了まで
// MIN_COUNTING_MINUTES 以上残っているとき true。「残り30分未満」や営業時間外は false。
export const countsTowardParticipation = (instant: Date): boolean => classifyVisit(instant).counted;

// 参加回数の重複排除キー。同一 (開催日, ターム) を 1 参加として数えるための文字列キー。
// 会場横断集計では参加者を区別するため `${participationKey(date, term)}#${participantId}` を使う。
export const participationKey = (eventDate: string, term: TermId): string => `${eventDate}#${term}`;
