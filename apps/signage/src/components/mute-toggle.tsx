'use client';

import { IconVolume, IconVolumeOff } from '@tabler/icons-react';

interface Props {
  muted: boolean;
  onToggle: () => void;
}

// 運用者向けの控えめな小コントロール（端末隅）。既定=無音。
export function MuteToggle({ muted, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? '動画の音声をオンにする' : '動画の音声をオフにする'}
      className="absolute right-4 bottom-4 z-40 flex size-11 items-center justify-center rounded-full bg-slate-950/50 text-white/70 backdrop-blur transition hover:text-white"
    >
      {muted ? <IconVolumeOff className="size-5" /> : <IconVolume className="size-5" />}
    </button>
  );
}
