import type { Transition } from 'motion/react';

// checkin と同じ入場イージング・タイミングに揃え、プラットフォーム全体で一貫した所作にする。
const EASE_OUT = 'easeOut' as const;

// カード/セクションのフェードアップ入場。
export const revealInitial = { opacity: 0, y: 12 } as const;
export const revealAnimate = { opacity: 1, y: 0 } as const;
export const REVEAL_STAGGER_STEP = 0.06;
export const revealTransition = (index = 0): Transition => ({
  duration: 0.4,
  ease: EASE_OUT,
  delay: index * REVEAL_STAGGER_STEP,
});

// ============================================================================
// 下部インフォメーション（lower-third）の所作
// ============================================================================
// ストーリーズ進行バー1本の寿命（ms）。スライド巡回間隔と一致させる（時間源を一本化）。
export const STORY_DURATION_MS = 8000;

// クリップ内のスライドアップ。親の overflow-hidden 前提で 100% 単位に動かす。
export const tickerSlideInitial = { y: '100%', opacity: 0 } as const;
export const tickerSlideAnimate = { y: '0%', opacity: 1 } as const;
export const tickerSlideExit = { y: '-100%', opacity: 0 } as const;
export const tickerSlideTransition: Transition = { duration: 0.5, ease: EASE_OUT };

// ラベル→値のスタッガー（REVEAL_STAGGER_STEP と同刻み）。
export const tickerLineTransition = (index = 0): Transition => ({
  duration: 0.4,
  ease: EASE_OUT,
  delay: 0.12 + index * REVEAL_STAGGER_STEP,
});
