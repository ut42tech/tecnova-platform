'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { mmss } from '@/lib/time';

// 桁単位の縦ロール（odometer）。秒は減る方向なので、新字が上から入り旧字が下へ抜ける。
// transform/opacity のみで GPU 合成に乗せ、reduced-motion / value=null では素の文字を返す。
// フリップ（3D回転）は大型壁面で派手・安っぽくなるため採らず、reveal/live-dot と同じ
// 「静かに動く」所作に揃える。
const ROLL_DURATION = 0.28;

// 1桁ぶんのスロット。tabular-nums 前提なので 1ch 幅で安定する。key=値 なので
// 「同じ数字のあいだ」は再アニメせず静止＝視線が落ち着く（毎秒は一の位だけ動く）。
function RollDigit({ char }: { char: string }) {
  if (char === ':') {
    return <span className="inline-block text-center">:</span>;
  }
  return (
    <span
      className="relative inline-block overflow-hidden text-center"
      style={{ width: '1ch', height: '1em', lineHeight: 1 }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={char}
          className="inline-block"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: ROLL_DURATION, ease: 'easeOut' }}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

interface Props {
  value: number | null; // 残り秒。内部で mmss して M:SS を桁スロットへ分解。
  className?: string;
  placeholder?: string;
}

// <AnimatedTime value={secondsLeft} /> — countdown-ring / break-overlay 共用のドロップイン。
export function AnimatedTime({ value, className, placeholder = '--:--' }: Props) {
  const reduced = useReducedMotion();
  const text = value === null ? placeholder : mmss(value);

  // reduced-motion / 値なし → 現行挙動と完全等価（アニメなし）。
  if (reduced || value === null) {
    return <span className={cn('tabular-nums', className)}>{text}</span>;
  }

  // 'M:SS' を1文字ずつスロット化。右詰めの『種別+位置』を key にすることで、
  // 可変長（9:59↔10:00・分のロールオーバー）でも桁数増減に追従する。
  const [mm, ss] = text.split(':');
  const slots = [
    ...mm.split('').map((c, i) => ({ id: `m${mm.length - i}`, char: c })),
    { id: 'colon', char: ':' },
    ...ss.split('').map((c, i) => ({ id: `s${i}`, char: c })),
  ];

  return (
    <span className={cn('inline-flex tabular-nums', className)} role="img" aria-label={text}>
      {slots.map((slot) => (
        <RollDigit key={slot.id} char={slot.char} />
      ))}
    </span>
  );
}
