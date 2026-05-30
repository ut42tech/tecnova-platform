'use client';

import type { CycleMoment, CyclePhase } from '@tecnova/shared/activity-cycle';
import type { SignagePlaylistItem } from '@tecnova/shared/schemas';
import { airStatus } from '@/lib/broadcast';
import type { SignageData } from '@/lib/use-signage-data';
import { ChimeRail } from './chime-rail';
import { InfoTicker } from './info-ticker';
import { Reveal } from './reveal';
import { StageHeader } from './stage-header';
import { VideoStage } from './video-stage';

interface Props {
  phase: CyclePhase;
  moment: CycleMoment;
  now: Date;
  data: SignageData;
  videoIds: string[];
  currentTrack: SignagePlaylistItem | null;
  muted: boolean;
  started: boolean;
  onToggleMute: () => void;
  onVideoChange: (index: number) => void;
  soon: boolean;
  nextStartAt: Date | null;
  phaseSecondsLeft: number | null;
  debug?: boolean;
}

// 配信レイアウト全体。上=ヘッダ、中=動画パネル＋チャイムレーン、下=巡回インフォメーション。
export function BroadcastFrame({
  phase,
  moment,
  now,
  data,
  videoIds,
  currentTrack,
  muted,
  started,
  onToggleMute,
  onVideoChange,
  soon,
  nextStartAt,
  phaseSecondsLeft,
  debug,
}: Props) {
  const status = airStatus({ phase, soon, hasNext: nextStartAt !== null });
  return (
    <div className="grid h-full w-full grid-rows-[auto_1fr_auto] gap-[clamp(0.75rem,1.6vh,1.5rem)] bg-gradient-to-b from-sky-50 to-white p-[clamp(1rem,2vw,2rem)]">
      <Reveal index={0}>
        <StageHeader now={now} status={status} />
      </Reveal>

      <Reveal
        index={1}
        className="grid min-h-0 grid-cols-[1fr_clamp(18rem,24vw,28rem)] gap-[clamp(0.75rem,1.6vw,1.5rem)]"
      >
        <VideoStage
          phase={phase}
          videoIds={videoIds}
          muted={muted}
          started={started}
          onToggleMute={onToggleMute}
          onVideoChange={onVideoChange}
          secondsToPhaseEnd={phaseSecondsLeft}
          now={now}
          soon={soon}
          nextStartAt={nextStartAt}
          present={data.currentlyPresent}
        />
        <ChimeRail phase={phase} moment={moment} now={now} soon={soon} nextStartAt={nextStartAt} />
      </Reveal>

      <Reveal index={2}>
        <InfoTicker
          currentTrack={currentTrack}
          present={data.currentlyPresent}
          totalCheckedIn={data.totalCheckedIn}
          debug={debug}
        />
      </Reveal>
    </div>
  );
}
