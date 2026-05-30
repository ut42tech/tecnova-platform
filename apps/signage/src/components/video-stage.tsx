'use client';

import type { CyclePhase } from '@tecnova/shared/activity-cycle';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BreakOverlay } from './break-overlay';
import { IdleOverlay } from './idle-overlay';
import { MuteToggle } from './mute-toggle';
import { YoutubePlayer } from './youtube-player';

interface Props {
  phase: CyclePhase;
  videoIds: string[];
  muted: boolean;
  started: boolean;
  onToggleMute: () => void;
  onVideoChange: (index: number) => void;
  secondsToPhaseEnd: number | null; // 休憩中の残り秒
  now: Date;
  soon: boolean;
  nextStartAt: Date | null;
  present: number;
}

// 縮小した動画パネル。IFrame は常時マウントし、休憩/待機スライドを上にクロスフェードする。
export function VideoStage({
  phase,
  videoIds,
  muted,
  started,
  onToggleMute,
  onVideoChange,
  secondsToPhaseEnd,
  now,
  soon,
  nextStartAt,
  present,
}: Props) {
  const reduced = useReducedMotion();
  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-slate-950 shadow-xl ring-1 ring-foreground/10">
      <YoutubePlayer
        videoIds={videoIds}
        active={phase === 'activity'}
        muted={muted}
        started={started}
        onVideoChange={onVideoChange}
      />

      <AnimatePresence>
        {phase === 'break' && (
          <motion.div
            key="break"
            className="absolute inset-0 z-20"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.5 }}
          >
            <BreakOverlay secondsToResume={secondsToPhaseEnd} present={present} />
          </motion.div>
        )}
        {phase === 'idle' && (
          <motion.div
            key="idle"
            className="absolute inset-0 z-20"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.5 }}
          >
            <IdleOverlay now={now} soon={soon} nextStartAt={nextStartAt} present={present} />
          </motion.div>
        )}
      </AnimatePresence>

      {started && <MuteToggle muted={muted} onToggle={onToggleMute} />}
    </div>
  );
}
