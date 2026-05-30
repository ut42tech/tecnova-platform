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

// 下部インフォメーションのスライド切替（lower-third のクロスフェード）。
export const slideInitial = { opacity: 0, y: 10 } as const;
export const slideAnimate = { opacity: 1, y: 0 } as const;
export const slideExit = { opacity: 0, y: -10 } as const;
export const slideTransition: Transition = { duration: 0.45, ease: EASE_OUT };
