'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';

type AnimatedNumberProps = {
  value: number;
  className?: string;
  // カウントアップの長さ（ms）。reduced-motion 時は無視して即値を出す。
  durationMs?: number;
};

// 0 → value をカウントアップ表示する。prefers-reduced-motion を尊重し、その時はアニメーションせず即値を出す。
// 値は整数想定（参加回数・来場回数）。桁揃えは呼び出し側で tabular-nums を付ける。
export function AnimatedNumber({ value, className, durationMs = 700 }: AnimatedNumberProps) {
  const prefersReduced = useReducedMotion();
  // reduced-motion なら最初から value で初期化し、0 からの一瞬のちらつきも避ける。
  const motionValue = useMotionValue(prefersReduced ? value : 0);
  const text = useTransform(motionValue, (latest) => String(Math.round(latest)));

  useEffect(() => {
    if (prefersReduced) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: durationMs / 1000,
      ease: 'easeOut',
    });
    return () => controls.stop();
  }, [value, durationMs, prefersReduced, motionValue]);

  return <motion.span className={className}>{text}</motion.span>;
}
