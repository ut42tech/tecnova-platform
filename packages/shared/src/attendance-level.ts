// 来場者数から会場の「にぎわい」レベルを求める純粋ロジック。
// サイネージのにぎわい表示や混雑案内に使う想定。venue-schedule と同じく Workers 安全。
//
// しきい値は実運用データが無いうちの暫定値。会場規模が分かったらこの配列だけ調整すればよい
// （表示文言・配色は呼び出し側＝サイネージの presentation 層が担当する）。

export type AttendanceLevel = 'quiet' | 'steady' | 'lively' | 'crowded';

// 各レベルの下限人数（その人数“以上”でそのレベル）。降順に並べ、先に満たしたものを採用する。
export const ATTENDANCE_LEVEL_THRESHOLDS: readonly { min: number; level: AttendanceLevel }[] = [
  { min: 30, level: 'crowded' },
  { min: 18, level: 'lively' },
  { min: 8, level: 'steady' },
  { min: 0, level: 'quiet' },
];

export const classifyAttendanceLevel = (present: number): AttendanceLevel => {
  // 負値・端数は丸めて 0 以上の整数として扱う。
  const n = Math.max(0, Math.floor(present));
  for (const t of ATTENDANCE_LEVEL_THRESHOLDS) {
    if (n >= t.min) return t.level;
  }
  return 'quiet';
};
