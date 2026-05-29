import type { Transition } from 'motion/react';

// 入場・小要素演出のイージングは全画面でこの値に統一する（プロフィール画面と同値）。
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

// タイル/小要素のポップ（来場ヒートマップと同値）。スタッガーは間延びしないよう頭打ち。
export const popInitial = { opacity: 0, scale: 0.6 } as const;
export const popAnimate = { opacity: 1, scale: 1 } as const;
export const POP_STAGGER_STEP = 0.012;
export const POP_STAGGER_MAX = 0.5;
export const popTransition = (index = 0): Transition => ({
  duration: 0.25,
  ease: EASE_OUT,
  delay: Math.min(index * POP_STAGGER_STEP, POP_STAGGER_MAX),
});

// 検索結果・候補・履歴行など、行数が多いリスト向けの大きめスタッガー。
export const LIST_STAGGER_STEP = 0.04;
export const LIST_STAGGER_MAX = 0.4;
export const listItemTransition = (index = 0): Transition => ({
  duration: 0.3,
  ease: EASE_OUT,
  delay: Math.min(index * LIST_STAGGER_STEP, LIST_STAGGER_MAX),
});
