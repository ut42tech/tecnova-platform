'use client';

import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { STORY_DURATION_MS } from '@/lib/motion';

// 下部インフォの巡回管理。index（現在スライド）と送り操作だけを React state で持ち、
// 進行バーの満ち（毎フレーム）は StoryProgress 側の MotionValue が担う（本体を毎フレーム
// 再レンダしないため）。巡回は実時間固定で、?debug の擬似時計・倍速には追従しない
// （チャイムの活動時計とは独立した情報表示のため）。
export function useStoryRotation(count: number) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  const advance = useCallback(() => {
    setIndex((p) => (count > 0 ? (p + 1) % count : 0));
  }, [count]);

  const goTo = useCallback(
    (next: number) => {
      setIndex(count > 0 ? ((next % count) + count) % count : 0);
    },
    [count],
  );

  // reduced-motion 時は進行バーを動かさず、一定間隔で送りだけ続ける（情報は一巡する）。
  useEffect(() => {
    if (!reduced || count <= 1) return;
    const id = window.setInterval(advance, STORY_DURATION_MS);
    return () => window.clearInterval(id);
  }, [reduced, count, advance]);

  // animate=true のときだけ RAF 駆動の StoryProgress をマウントする（不要時は RAF を回さない）。
  const animate = !reduced && count > 1;

  return { index: count > 0 ? index % count : 0, goTo, advance, animate };
}
