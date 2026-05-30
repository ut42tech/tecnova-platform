'use client';

import {
  type ChimeEvent,
  classifyCycleMoment,
  msUntilNextBoundary,
} from '@tecnova/shared/activity-cycle';
import { useCallback, useEffect, useState } from 'react';
import { BreakScreen } from '@/components/break-screen';
import { IdleScreen } from '@/components/idle-screen';
import { InfoBar } from '@/components/info-bar';
import { MuteToggle } from '@/components/mute-toggle';
import { TapToStart } from '@/components/tap-to-start';
import { YoutubePlayer } from '@/components/youtube-player';
import { ensureAudioRunning, playChime, resumeAudio } from '@/lib/chimes';
import { getNow } from '@/lib/now';
import { useChimeScheduler } from '@/lib/use-chime-scheduler';
import { useMute } from '@/lib/use-mute';
import { useNow } from '@/lib/use-now';
import { usePlaylist } from '@/lib/use-playlist';
import { useSignageData } from '@/lib/use-signage-data';
import { useWakeLock } from '@/lib/use-wake-lock';

export default function SignagePage() {
  const [started, setStarted] = useState(false);
  const now = useNow(1000);
  const data = useSignageData();
  const videoIds = usePlaylist();
  const { muted, toggle } = useMute();
  const moment = classifyCycleMoment(now);

  // termCounts は毎ポーリングで作り直されるため useCallback による安定化は無意味
  // （スケジューラ側も毎 tick で ref に取り直す）。素の関数で十分。
  const isTermActive = (term: 'morning' | 'afternoon' | 'evening') => data.termCounts[term] > 0;

  // 現タームが稼働中（初回チェックイン済み）なら moment.phase、未稼働/ターム外は idle。
  const active = moment.term !== null && isTermActive(moment.term);
  const phase = active ? moment.phase : 'idle';

  useWakeLock(started);

  const onChime = useCallback((e: ChimeEvent) => {
    playChime(e.kind);
  }, []);
  useChimeScheduler({ enabled: started, isTermActive, onChime, getNow });

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

  // フェーズ終端までの秒（活動→休憩 / 休憩→再開）。
  const phaseSecondsLeft =
    moment.phaseEndsAt === null
      ? null
      : Math.ceil((moment.phaseEndsAt.getTime() - now.getTime()) / 1000);

  // idle の理由を区別：ターム内・未稼働なら「まもなく開始」、ターム外なら次タームの開始時刻。
  const inUnstartedTerm = moment.term !== null && !active;
  // 次の活動開始（次境界＝次タームの resume）はターム外のときだけ算出する
  // （ターム内・未稼働で算出すると次境界が break になり「次は HH:MM から」が誤表示になる）。
  const msNext = moment.term === null ? msUntilNextBoundary(now) : null;
  const nextStartAt = msNext === null ? null : new Date(now.getTime() + msNext);

  return (
    <main className="relative h-svh w-screen overflow-hidden bg-slate-950 text-white">
      {/* 動画は活動フェーズで再生。起動タップ前でもミュート自動再生で映像は出る（spec §6）。 */}
      <YoutubePlayer
        videoIds={videoIds}
        active={phase === 'activity'}
        muted={muted}
        started={started}
      />

      {phase === 'activity' && moment.term && (
        <InfoBar
          term={moment.term}
          now={now}
          present={data.currentlyPresent}
          secondsToBreak={phaseSecondsLeft}
        />
      )}

      <BreakScreen
        show={phase === 'break'}
        secondsToResume={phaseSecondsLeft}
        present={data.currentlyPresent}
      />

      <IdleScreen
        show={phase === 'idle'}
        soon={inUnstartedTerm}
        now={now}
        nextStartAt={nextStartAt}
        present={data.currentlyPresent}
      />

      {/* 無音トグルは起動後のみ表示（運用者向け）。既定は無音。 */}
      {started && <MuteToggle muted={muted} onToggle={toggle} />}

      {!started && <TapToStart onStart={handleStart} />}
    </main>
  );
}
