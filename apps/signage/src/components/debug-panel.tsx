'use client';

import {
  type ChimeKind,
  classifyCycleMoment,
  cycleChimeEventsForDay,
  secondsUntilNextBoundary,
} from '@tecnova/shared/activity-cycle';
import { TERM_LABELS, type TermId } from '@tecnova/shared/venue-schedule';
import { useState, useSyncExternalStore } from 'react';
import { getAudioState, playChime, resumeAudio } from '@/lib/chimes';
import {
  type DebugSnapshot,
  debugJumpTo,
  debugPause,
  debugPlay,
  debugReset,
  debugSetForcedActive,
  debugSetSpeed,
  debugToggleForcedActive,
  getDebugServerSnapshot,
  getDebugSnapshot,
  getNow,
  subscribeDebug,
} from '@/lib/now';
import { jstHm, mmss } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import type { SignageData } from '@/lib/use-signage-data';

interface Props {
  data: SignageData;
  videoIdCount: number;
  muted: boolean;
  started: boolean;
  // 起動タップを踏まずに音声（チャイム）を解放しスケジューラを有効化する。
  onEnableAudio: () => void;
}

const TERMS: TermId[] = ['morning', 'afternoon', 'evening'];
const SPEEDS = [1, 30, 120];
const KIND_JA: Record<ChimeKind, string> = {
  resume: '再開',
  break: '休憩',
  'term-end': 'ターム終了',
};

const jstHms = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const useDebug = (): DebugSnapshot =>
  useSyncExternalStore(subscribeDebug, getDebugSnapshot, getDebugServerSnapshot);

// ?debug=1 のときだけ page からマウントされる。下部の操作バーで擬似時計・稼働強制・
// 倍速・チャイムを制御し、待たずに全状態と各遷移＋チャイムを検証できるようにする。
export function DebugPanel({ data, videoIdCount, muted, started, onEnableAudio }: Props) {
  const snap = useDebug();
  const now = useNow(snap.playing && snap.speed > 1 ? 250 : 1000);
  const [open, setOpen] = useState(true);
  const [term, setTerm] = useState<TermId>(() => classifyCycleMoment(getNow()).term ?? 'morning');

  const moment = classifyCycleMoment(now);
  const audio = getAudioState();
  const audioReady = audio === 'running';
  const secsToBoundary = secondsUntilNextBoundary(now);
  const nextChime = cycleChimeEventsForDay(now)
    .filter((e) => e.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  // page.tsx と同じ稼働判定。リードアウトを実際の画面表示／スケジューラ発火と一致させる。
  const isActive = (t: TermId | null): boolean =>
    t !== null &&
    ((snap.debugEnabled && snap.forcedActiveTerms.includes(t)) || data.termCounts[t] > 0);
  const effectivePhase =
    moment.term === null ? 'idle(ターム外)' : isActive(moment.term) ? moment.phase : 'idle(未稼働)';

  // 境界の 5 秒手前へジャンプ（着地後 5 秒で本来の速度のままクロスフェード＋チャイムが 1 回）。
  const jumpBefore = (kind: ChimeKind): void => {
    const matching = cycleChimeEventsForDay(getNow()).filter(
      (e) => e.term === term && e.kind === kind,
    );
    // resume はターム頭（idle からの流入）を避け 2 本目以降を優先＝休憩→活動の遷移を見せる。
    const target = kind === 'resume' ? (matching[1] ?? matching[0]) : matching[0];
    if (!target) return;
    debugSetForcedActive(term, true); // 活動/休憩を出すため稼働 ON
    debugJumpTo(target.at.getTime() - 5000);
  };

  // ターム外 idle（昼休み）＝朝タームの term-end + 30 分。
  const jumpLunchIdle = (): void => {
    const end = cycleChimeEventsForDay(getNow()).find(
      (e) => e.term === 'morning' && e.kind === 'term-end',
    );
    if (end) debugJumpTo(end.at.getTime() + 30 * 60_000);
  };

  // ターム内・未稼働 idle（まもなく開始）＝選択タームの開始直後＋稼働 OFF。
  const jumpUnstartedIdle = (): void => {
    const start = cycleChimeEventsForDay(getNow()).find(
      (e) => e.term === term && e.kind === 'resume',
    );
    if (!start) return;
    debugSetForcedActive(term, false);
    debugJumpTo(start.at.getTime() + 30_000);
  };

  const manualChime = (kind: ChimeKind): void => {
    void resumeAudio().then(() => playChime(kind));
  };

  const btn =
    'rounded-md px-2.5 py-1 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed';
  const ghost = `${btn} bg-white/10 text-white hover:bg-white/20`;
  const on = `${btn} bg-amber-400 text-slate-900`;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 max-h-[55svh] overflow-auto bg-slate-900/95 text-white shadow-[0_-8px_30px_rgba(0,0,0,0.5)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 p-3">
        {/* ヘッダ */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-black">🛠 プレビュー</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${audioReady ? 'bg-emerald-500/30 text-emerald-200' : 'bg-rose-500/30 text-rose-200'}`}
          >
            音声: {audio}
          </span>
          <button type="button" className={`${ghost} ml-auto`} onClick={() => setOpen((v) => !v)}>
            {open ? '折りたたむ' : '開く'}
          </button>
          <button type="button" className={ghost} onClick={debugReset}>
            ⟲ 実時刻に戻す
          </button>
        </div>

        {!audioReady && (
          <div className="flex items-center gap-2 rounded-md bg-rose-500/20 px-2 py-1.5 text-xs text-rose-100">
            <span>チャイムを鳴らすには先に音声を解放してください。</span>
            <button type="button" className={`${on} ml-auto`} onClick={onEnableAudio}>
              ▶ 音声を解放
            </button>
          </div>
        )}

        {open && (
          <>
            {/* ターム選択 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-300">ターム</span>
              {TERMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={term === t ? on : ghost}
                  onClick={() => setTerm(t)}
                >
                  {TERM_LABELS[t]}
                </button>
              ))}
              <span className="ml-2 text-xs text-slate-300">稼働強制</span>
              {TERMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={snap.forcedActiveTerms.includes(t) ? on : ghost}
                  onClick={() => debugToggleForcedActive(t)}
                >
                  {TERM_LABELS[t]} {snap.forcedActiveTerms.includes(t) ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>

            {/* プリセット・ジャンプ（主役）＋ idle */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-300">5秒前へ</span>
              <button type="button" className={ghost} onClick={() => jumpBefore('resume')}>
                再開（活動へ）
              </button>
              <button type="button" className={ghost} onClick={() => jumpBefore('break')}>
                休憩へ
              </button>
              <button type="button" className={ghost} onClick={() => jumpBefore('term-end')}>
                ターム終了へ
              </button>
              <span className="ml-2 text-xs text-slate-300">待機</span>
              <button type="button" className={ghost} onClick={jumpUnstartedIdle}>
                まもなく開始
              </button>
              <button type="button" className={ghost} onClick={jumpLunchIdle}>
                昼休み
              </button>
            </div>

            {/* トランスポート */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={snap.playing ? ghost : on}
                onClick={snap.playing ? debugPause : debugPlay}
              >
                {snap.playing ? '⏸ 一時停止' : '▶ 再生'}
              </button>
              <span className="ml-1 text-xs text-slate-300">速度</span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={snap.speed === s ? on : ghost}
                  onClick={() => debugSetSpeed(s)}
                >
                  ×{s}
                </button>
              ))}
              <span className="ml-2 text-xs text-slate-300">手動チャイム</span>
              <button type="button" className={ghost} onClick={() => manualChime('resume')}>
                再開
              </button>
              <button type="button" className={ghost} onClick={() => manualChime('break')}>
                休憩
              </button>
              <button type="button" className={ghost} onClick={() => manualChime('term-end')}>
                ターム終了
              </button>
            </div>

            {/* 状態リードアウト */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-md bg-black/30 p-2 text-[11px] text-slate-200 sm:grid-cols-3">
              <span>擬似時刻: {jstHms.format(now)}</span>
              <span>phase: {effectivePhase}</span>
              <span>
                term: {moment.term ?? '—'} / cycle: {moment.cycleIndex ?? '—'}
              </span>
              <span>次境界まで: {secsToBoundary === null ? '—' : mmss(secsToBoundary)}</span>
              <span>
                次チャイム:{' '}
                {nextChime
                  ? `${KIND_JA[nextChime.kind]} @${jstHm(nextChime.at)}${
                      isActive(nextChime.term) ? '' : '（未稼働で鳴りません）'
                    }`
                  : '—'}
              </span>
              <span>
                速度: ×{snap.speed} / {snap.playing ? '再生中' : '停止'}
              </span>
              <span>
                termCounts: 朝{data.termCounts.morning}/昼{data.termCounts.afternoon}/夕
                {data.termCounts.evening}
              </span>
              <span>在館: {data.currentlyPresent}</span>
              <span>
                動画: {videoIdCount}本 / 音声{muted ? 'ミュート' : 'あり'} /{' '}
                {started ? '起動済' : '未起動'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
