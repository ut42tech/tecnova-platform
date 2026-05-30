'use client';

import {
  IconBroadcast,
  IconBulb,
  IconHeartHandshake,
  IconPlayerPlayFilled,
  IconSparkles,
  IconUsers,
} from '@tabler/icons-react';
import { classifyAttendanceLevel } from '@tecnova/shared/attendance-level';
import type { SignagePlaylistItem } from '@tecnova/shared/schemas';
import { cn } from '@tecnova/ui/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useState } from 'react';
import { ATTENDANCE_META } from '@/lib/broadcast';
import { slideAnimate, slideExit, slideInitial, slideTransition } from '@/lib/motion';

// スライドの表示秒。
const ROTATE_MS = 8000;

interface Slide {
  id: string;
  icon: ReactNode;
  chip: string;
  label: string;
  value: ReactNode;
}

interface Props {
  currentTrack: SignagePlaylistItem | null;
  present: number;
  totalCheckedIn: number;
  debug?: boolean; // ?debug=1 時に手動送りボタンを出す
}

// 配信下部の lower-third。動画タイトル・来場・にぎわい・主催/共催・テクノバ紹介を巡回表示する。
export function InfoTicker({ currentTrack, present, totalCheckedIn, debug }: Props) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  const level = classifyAttendanceLevel(present);
  const liveliness = ATTENDANCE_META[level];

  const slides: Slide[] = [];
  if (currentTrack?.title) {
    slides.push({
      id: 'now-playing',
      icon: <IconPlayerPlayFilled />,
      chip: 'bg-sky-100 text-sky-700',
      label: 'いま流れているどうが',
      value: currentTrack.title,
    });
  }
  slides.push({
    id: 'attendance',
    icon: <IconUsers />,
    chip: 'bg-emerald-100 text-emerald-700',
    label: 'いまの来場',
    value: (
      <>
        <span className="tabular-nums">{present}</span> 人
        <span className="ml-2 text-[0.6em] font-bold text-slate-400">本日 {totalCheckedIn} 人</span>
      </>
    ),
  });
  slides.push({
    id: 'liveliness',
    icon: <IconSparkles />,
    chip: liveliness.chip,
    label: 'かいじょうの にぎわい',
    value: liveliness.label,
  });
  slides.push({
    id: 'cohost',
    icon: <IconHeartHandshake />,
    chip: 'bg-violet-100 text-violet-700',
    label: '主催・共催',
    value: 'tec-nova ／ 長崎市 × 長崎大学',
  });
  slides.push({
    id: 'about',
    icon: <IconBulb />,
    chip: 'bg-amber-100 text-amber-800',
    label: 'tec-nova ながさき とは',
    value: '子どもたちの「つくってみたい！」をかたちにする、ファブリケーション活動です。',
  });
  slides.push({
    id: 'platform',
    icon: <IconBroadcast />,
    chip: 'bg-slate-100 text-slate-600',
    label: 'tecnova-platform',
    value: '受付からサイネージまで、運営を支えるオープンソースの基盤です。',
  });

  const count = slides.length;
  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => setI((p) => (p + 1) % count), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count]);

  const idx = i % count;
  const active = slides[idx];

  return (
    <div className="flex items-center gap-[clamp(0.75rem,1.6vw,1.5rem)] rounded-2xl bg-white/90 px-[clamp(1rem,2vw,2rem)] py-[clamp(0.6rem,1.4vh,1.1rem)] shadow-sm ring-1 ring-foreground/10 backdrop-blur">
      <span
        className={cn(
          'grid size-[clamp(2.5rem,4vw,3.5rem)] shrink-0 place-items-center rounded-xl [&>svg]:size-[55%]',
          active.chip,
        )}
      >
        {active.icon}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={reduced ? false : slideInitial}
            animate={slideAnimate}
            exit={reduced ? { opacity: 0 } : slideExit}
            transition={reduced ? { duration: 0 } : slideTransition}
          >
            <p className="text-[clamp(0.7rem,1.1vw,0.95rem)] font-bold text-slate-400">
              {active.label}
            </p>
            <p className="line-clamp-2 text-[clamp(1rem,2vw,1.7rem)] font-black text-slate-900">
              {active.value}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-[clamp(0.4rem,0.8vw,0.75rem)]">
        {debug && (
          <span className="mr-1 flex gap-1">
            <button
              type="button"
              onClick={() => setI((p) => (p - 1 + count) % count)}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => setI((p) => (p + 1) % count)}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
            >
              ▶
            </button>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          {slides.map((s, n) => (
            <span
              key={s.id}
              className={cn(
                'size-2 rounded-full transition-colors',
                n === idx ? 'bg-slate-800' : 'bg-slate-300',
              )}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
