'use client';

import { useYoutubePlayer } from '@/lib/use-youtube-player';

const PLAYER_ELEMENT_ID = 'signage-youtube-player';

interface Props {
  videoIds: string[];
  active: boolean;
  muted: boolean;
  started: boolean;
}

// IFrame は常時マウント（再読込フラッシュ防止）。未ロード時は背後のワードマークを見せ、
// 動画ロード後に iframe を opacity:1 で前に出す（use-youtube-player が制御）。
export function YoutubePlayer({ videoIds, active, muted, started }: Props) {
  useYoutubePlayer({ elementId: PLAYER_ELEMENT_ID, videoIds, active, muted, started });

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl font-black tracking-wide text-white/10">tec-nova Nagasaki</span>
      </div>
      {/* YT.Player がこの div を iframe に置換し、JS 側で全画面化＋可視制御する。 */}
      <div id={PLAYER_ELEMENT_ID} />
    </div>
  );
}
