// 来場者数（同時滞在数）から会場の「にぎわい」レベルを求める純粋ロジック。
// サイネージのにぎわい表示や混雑案内に使う想定。venue-schedule と同じく Workers 安全。

// 同時滞在の想定上限（＝一番混んでいる状態）。にぎわいメーターはこの値を満員=1 とする。
// 運用実測で会場規模が変わったらこの定数を直せばよい。
export const ATTENDANCE_CAPACITY = 25;

export type AttendanceLevel = 'quiet' | 'steady' | 'lively' | 'crowded';

// 想定上限 25 をおよそ四分割したしきい値（各レベルの下限人数＝その人数“以上”でそのレベル）。
// 降順に並べ、先に満たしたものを採用する。25 人で crowded（満員）に達する。
export const ATTENDANCE_LEVEL_THRESHOLDS: readonly { min: number; level: AttendanceLevel }[] = [
  { min: 19, level: 'crowded' }, // 75%〜
  { min: 13, level: 'lively' }, // 50%〜
  { min: 7, level: 'steady' }, // 25%〜
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

// 想定上限に対する充足率（0..1）。にぎわいメーターのバー長などに使う。
export const occupancyRatio = (present: number): number => {
  const n = Math.max(0, present);
  return Math.min(1, n / ATTENDANCE_CAPACITY);
};
