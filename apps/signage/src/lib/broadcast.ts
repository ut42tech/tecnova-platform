import type { CyclePhase } from '@tecnova/shared/activity-cycle';
import type { AttendanceLevel } from '@tecnova/shared/attendance-level';

// 配信（ブロードキャスト）画面のステータス。チャイムの役割を持つ右レーンとヘッダのバッジで使う。
export type AirStatus = 'live' | 'break' | 'soon' | 'standby' | 'ended';

export const airStatus = ({
  phase,
  soon,
  hasNext,
}: {
  phase: CyclePhase;
  soon: boolean; // ターム内・未稼働（まもなく開始）
  hasNext: boolean; // この後にまだタームがある
}): AirStatus => {
  if (phase === 'activity') return 'live';
  if (phase === 'break') return 'break';
  if (soon) return 'soon';
  return hasNext ? 'standby' : 'ended';
};

// ステータスごとの見た目。dot=点の色 / chip=ピル / pulse=点を脈動させるか。
export const AIR_STATUS_META: Record<
  AirStatus,
  { label: string; dot: string; chip: string; pulse: boolean }
> = {
  live: {
    label: 'オンエア',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700',
    pulse: true,
  },
  break: { label: '休憩中', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800', pulse: true },
  soon: { label: 'まもなく開始', dot: 'bg-sky-500', chip: 'bg-sky-100 text-sky-700', pulse: true },
  standby: {
    label: '準備中',
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600',
    pulse: false,
  },
  ended: {
    label: '本日終了',
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600',
    pulse: false,
  },
};

// にぎわいレベルごとの見た目。fill=メーターの満たし割合（0..1）。
export const ATTENDANCE_META: Record<
  AttendanceLevel,
  { label: string; chip: string; bar: string; fill: number }
> = {
  quiet: {
    label: 'ゆったり',
    chip: 'bg-slate-100 text-slate-600',
    bar: 'bg-slate-400',
    fill: 0.25,
  },
  steady: { label: 'ほどよい', chip: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500', fill: 0.5 },
  lively: {
    label: 'にぎやか',
    chip: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
    fill: 0.75,
  },
  crowded: {
    label: '大にぎわい',
    chip: 'bg-amber-100 text-amber-800',
    bar: 'bg-amber-500',
    fill: 1,
  },
};
