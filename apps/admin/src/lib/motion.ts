import type { Transition } from 'motion/react';

// 入場・小要素演出のイージングは全画面でこの値に統一する（checkin / signage と同値）。
const EASE_OUT = 'easeOut' as const;

// セクション/カードのフェードアップ入場。
export const revealInitial = { opacity: 0, y: 12 } as const;
export const revealAnimate = { opacity: 1, y: 0 } as const;
export const REVEAL_STAGGER_STEP = 0.06;
export const revealTransition = (index = 0): Transition => ({
  duration: 0.4,
  ease: EASE_OUT,
  delay: index * REVEAL_STAGGER_STEP,
});

// 主要ボタンの押下フィードバック。
export const tapScale = { scale: 0.97 } as const;

// ナビのアクティブインジケータ（layoutId で滑らせる）。控えめに、跳ねさせない。
export const navIndicatorTransition: Transition = {
  type: 'spring',
  stiffness: 480,
  damping: 38,
};
