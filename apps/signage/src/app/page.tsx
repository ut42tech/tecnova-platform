'use client';

import {
  type ChimeEvent,
  classifyCycleMoment,
  msUntilNextBoundary,
} from '@tecnova/shared/activity-cycle';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BroadcastFrame } from '@/components/broadcast-frame';
import { DebugPanel } from '@/components/debug-panel';
import { TapToStart } from '@/components/tap-to-start';
import { ensureAudioRunning, playChime, resumeAudio } from '@/lib/chimes';
import {
  enableDebug,
  getDebugServerSnapshot,
  getDebugSnapshot,
  getNow,
  isDebugQueryEnabled,
  subscribeDebug,
} from '@/lib/now';
import { useChimeScheduler } from '@/lib/use-chime-scheduler';
import { useMute } from '@/lib/use-mute';
import { useNow } from '@/lib/use-now';
import { usePlaylist } from '@/lib/use-playlist';
import { useSignageData } from '@/lib/use-signage-data';
import { useWakeLock } from '@/lib/use-wake-lock';

export default function SignagePage() {
  const [started, setStarted] = useState(false);
  // ?debug=1 のときだけ有効なプレビュー用ストア。本番では全フィールド既定値のまま。
  const debug = useSyncExternalStore(subscribeDebug, getDebugSnapshot, getDebugServerSnapshot);
  const now = useNow(debug.debugEnabled ? 250 : 1000);
  const data = useSignageData();
  const tracks = usePlaylist();
  const videoIds = tracks.map((t) => t.videoId);
  const { muted, toggle } = useMute();
  // いま再生中トラック（インフォメーションの動画タイトル表示用）。
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentTrack = tracks[currentIndex] ?? null;
  const moment = classifyCycleMoment(now);

  // ?debug=1 ならマウント後にデバッグストアを有効化する（SSR/hydration は素通り）。
  useEffect(() => {
    if (isDebugQueryEnabled()) enableDebug();
  }, []);

  // デバッグ時は forcedActiveTerms を OR して、実チェックインデータ無しでも稼働を再現する
  // （debugEnabled=false なら短絡し本番挙動と完全同値）。
  const isTermActive = (term: 'morning' | 'afternoon' | 'evening') =>
    (debug.debugEnabled && debug.forcedActiveTerms.includes(term)) || data.termCounts[term] > 0;

  // 現タームが稼働中（初回チェックイン済み）なら moment.phase、未稼働/ターム外は idle。
  const active = moment.term !== null && isTermActive(moment.term);
  const phase = active ? moment.phase : 'idle';

  useWakeLock(started);

  const onChime = useCallback((e: ChimeEvent) => {
    playChime(e.kind);
  }, []);
  useChimeScheduler({
    enabled: started,
    isTermActive,
    onChime,
    getNow,
    jumpEpoch: debug.jumpEpoch,
  });

  // タブ復帰時に AudioContext が suspended に戻っていれば再開する（spec §6）。
  useEffect(() => {
    if (!started) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void ensureAudioRunning();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [started]);

  const handleStart = async (): Promise<void> => {
    await resumeAudio();
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // 全画面はベストエフォート（dev では拒否されうる）。
    }
    setStarted(true);
  };

  // フェーズ終端までの秒（活動→休憩 / 休憩→再開）。休憩スライドのカウントダウンに使う。
  const phaseSecondsLeft =
    moment.phaseEndsAt === null
      ? null
      : Math.ceil((moment.phaseEndsAt.getTime() - now.getTime()) / 1000);

  // idle の理由を区別：ターム内・未稼働なら「まもなく開始」、ターム外なら次タームの開始時刻。
  const inUnstartedTerm = moment.term !== null && !active;
  // 次の活動開始（次境界＝次タームの resume）はターム外のときだけ算出する。
  const msNext = moment.term === null ? msUntilNextBoundary(now) : null;
  const nextStartAt = msNext === null ? null : new Date(now.getTime() + msNext);

  return (
    <main className="relative h-svh w-screen overflow-hidden">
      <BroadcastFrame
        phase={phase}
        moment={moment}
        now={now}
        data={data}
        videoIds={videoIds}
        currentTrack={currentTrack}
        muted={muted}
        started={started}
        onToggleMute={toggle}
        onVideoChange={setCurrentIndex}
        soon={inUnstartedTerm}
        nextStartAt={nextStartAt}
        phaseSecondsLeft={phaseSecondsLeft}
        debug={debug.debugEnabled}
      />

      {!started && <TapToStart onStart={handleStart} />}

      {/* ?debug=1 のときだけプレビュー操作バーを出す（本番壁面では出ない）。 */}
      {debug.debugEnabled && (
        <DebugPanel
          data={data}
          videoIdCount={videoIds.length}
          muted={muted}
          started={started}
          onEnableAudio={() => {
            void resumeAudio();
            setStarted(true);
          }}
        />
      )}
    </main>
  );
}
