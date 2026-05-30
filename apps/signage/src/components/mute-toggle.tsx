'use client';

import { IconVolume, IconVolumeOff } from '@tabler/icons-react';

// 動画パネル右上に置く控えめな音声トグル（運用者向け）。既定=無音。
export function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? '動画の音声をオンにする' : '動画の音声をオフにする'}
      className="absolute top-[1vw] right-[1vw] z-30 flex size-[clamp(2.5rem,3.4vw,3.25rem)] items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur transition hover:bg-black/55 hover:text-white"
    >
      {muted ? (
        <IconVolumeOff className="size-[clamp(1.1rem,1.8vw,1.6rem)]" />
      ) : (
        <IconVolume className="size-[clamp(1.1rem,1.8vw,1.6rem)]" />
      )}
    </button>
  );
}
