import type { ChimeKind } from '@tecnova/shared/activity-cycle';

// 単一の AudioContext を使い回す（ブラウザは同時 context 数を制限するため）。
let ctx: AudioContext | null = null;

const getCtx = (): AudioContext => {
  if (!ctx) ctx = new AudioContext();
  return ctx;
};

// 起動タップ内で呼ぶ。自動再生制約を解放する。
export const resumeAudio = async (): Promise<void> => {
  const c = getCtx();
  if (c.state !== 'running') await c.resume();
};

// suspended に戻っていれば再開（OS スリープ後・タブ復帰時）。
export const ensureAudioRunning = async (): Promise<void> => {
  if (ctx && ctx.state !== 'running') await ctx.resume();
};

const tone = (
  c: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  type: OscillatorType,
): void => {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // 指数エンベロープでベル風の余韻（0 には到達できないので 0.0001 へ）。
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.5, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
};

// 種別ごとに音色・音程を変える。
const PATTERNS: Record<ChimeKind, { freqs: [number, number]; type: OscillatorType; dur: number }> =
  {
    resume: { freqs: [784, 988], type: 'sine', dur: 0.7 }, // 上行＝再開
    break: { freqs: [988, 784], type: 'sine', dur: 0.8 }, // 下行＝休憩（キンコン）
    'term-end': { freqs: [880, 587], type: 'triangle', dur: 1.2 }, // 長め＝ターム終了
  };

export const playChime = (kind: ChimeKind): void => {
  const c = getCtx();
  if (c.state !== 'running') return; // 解放前は鳴らさない
  const { freqs, type, dur } = PATTERNS[kind];
  const t = c.currentTime + 0.02;
  tone(c, freqs[0], t, dur, type);
  tone(c, freqs[1], t + 0.45, dur, type);
};
