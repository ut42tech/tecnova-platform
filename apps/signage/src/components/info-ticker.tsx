'use client';

import {
  IconBrandInstagram,
  IconHistory,
  IconPlayerPlayFilled,
  IconServer,
  IconSparkles,
  IconUsers,
} from '@tabler/icons-react';
import { classifyAttendanceLevel, occupancyRatio } from '@tecnova/shared/attendance-level';
import type { SignagePlaylistItem } from '@tecnova/shared/schemas';
import { cn } from '@tecnova/ui/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { INSTAGRAM_HANDLE, PREVIOUS_EVENT_NOTE } from '@/config/info-slides';
import { ATTENDANCE_META } from '@/lib/broadcast';
import {
  tickerLineTransition,
  tickerSlideAnimate,
  tickerSlideExit,
  tickerSlideInitial,
  tickerSlideTransition,
} from '@/lib/motion';
import { useStoryRotation } from '@/lib/use-story-rotation';
import { StoryBars } from './story-bars';
import { StoryProgress } from './story-progress';

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

// 配信下部の lower-third。動画タイトル・来場・にぎわい・コンセプト・OSS・主催/共催を巡回。
// 巡回の時間源は useStoryRotation（AnimationFrame）に一本化し、進行バーの満ち＝送りとする。
export function InfoTicker({ currentTrack, present, totalCheckedIn, debug }: Props) {
  const reduced = useReducedMotion();
  const level = classifyAttendanceLevel(present);
  const liveliness = ATTENDANCE_META[level];
  const occ = occupancyRatio(present);

  const slides: Slide[] = [];
  slides.push({
    id: 'attendance',
    icon: <IconUsers />,
    chip: 'bg-emerald-100 text-emerald-700',
    label: 'いま 会場にいる人',
    value: (
      <>
        <span className="tabular-nums">{present}</span> 人
        <span className="ml-2 text-[0.62em] font-bold text-slate-400">
          本日 {totalCheckedIn} 人
        </span>
      </>
    ),
  });
  slides.push({
    id: 'liveliness',
    icon: <IconSparkles />,
    chip: liveliness.chip,
    label: 'かいじょうの にぎわい',
    value: (
      <span className="inline-flex items-center gap-3 align-middle">
        {liveliness.label}
        <span className="inline-block h-[clamp(0.45rem,0.9vw,0.7rem)] w-[clamp(4rem,11vw,10rem)] overflow-hidden rounded-full bg-slate-200 align-middle">
          <span
            className={cn(
              'block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
              liveliness.bar,
            )}
            style={{ width: `${occ * 100}%` }}
          />
        </span>
      </span>
    ),
  });
  slides.push({
    id: 'platform',
    icon: <IconServer />,
    chip: 'bg-slate-100 text-slate-600',
    label: 'テクノバながさきプラットフォーム',
    value: 'テクノバを支える基盤システム。\nチーフメンターのたくやが開発・運用しています。',
  });
  slides.push({
    id: 'instagram',
    icon: <IconBrandInstagram />,
    chip: 'bg-pink-100 text-pink-700',
    label: '公式インスタグラム',
    value: (
      <>
        @{INSTAGRAM_HANDLE}
        <span className="ml-2 text-[0.62em] font-bold text-slate-400">さいしんの活動はこちら</span>
      </>
    ),
  });
  // 前回のテクノバ情報（config に設定があるときだけ）。
  if (PREVIOUS_EVENT_NOTE) {
    slides.push({
      id: 'previous-info',
      icon: <IconHistory />,
      chip: 'bg-violet-100 text-violet-700',
      label: '前回のテクノバ',
      value: PREVIOUS_EVENT_NOTE,
    });
  }
  // いま流れている動画タイトルは末尾に追加する。タイトルは後着なので、先頭挿入だと
  // 既存スライドの index がずれて表示が飛ぶ（末尾追加なら他スライドの位置は不変）。
  if (currentTrack?.title) {
    slides.push({
      id: 'now-playing',
      icon: <IconPlayerPlayFilled />,
      chip: 'bg-sky-100 text-sky-700',
      label: 'いま流れているどうが',
      value: currentTrack.title,
    });
  }

  const count = slides.length;
  const { index, goTo, advance, animate } = useStoryRotation(count);
  const active = slides[index];

  return (
    <div className="flex items-center gap-[clamp(0.75rem,1.6vw,1.5rem)] rounded-2xl bg-white/90 px-[clamp(1rem,2vw,2rem)] py-[clamp(0.6rem,1.4vh,1.1rem)] shadow-sm ring-1 ring-foreground/10 backdrop-blur">
      {/* アイコンチップ：key 切替時だけ scale + ごく僅かな傾きを1回（spring）。 */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={active.id}
          initial={reduced ? false : { scale: 0.9, rotate: -4, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
          transition={
            reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 26, mass: 0.6 }
          }
          className={cn(
            'grid size-[clamp(2.5rem,4vw,3.5rem)] shrink-0 place-items-center rounded-xl [&>svg]:size-[55%]',
            active.chip,
          )}
        >
          {active.icon}
        </motion.span>
      </AnimatePresence>

      {/* テキスト：クリップ内スライドアップ + ラベル→値スタッガー。 */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={reduced ? false : tickerSlideInitial}
            animate={tickerSlideAnimate}
            exit={reduced ? { opacity: 0 } : tickerSlideExit}
            transition={reduced ? { duration: 0 } : tickerSlideTransition}
          >
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : tickerLineTransition(0)}
              className="text-[clamp(0.7rem,1.1vw,0.95rem)] font-bold text-slate-400"
            >
              {active.label}
            </motion.p>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : tickerLineTransition(1)}
              className="line-clamp-2 whitespace-pre-line text-[clamp(1rem,2vw,1.7rem)] font-black leading-snug text-slate-900"
            >
              {active.value}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-[clamp(0.4rem,0.8vw,0.75rem)]">
        {debug && (
          <span className="mr-1 flex gap-1">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
            >
              ▶
            </button>
          </span>
        )}
        {animate ? (
          <StoryProgress count={count} index={index} onAdvance={advance} />
        ) : (
          <StoryBars count={count} index={index} />
        )}
      </div>
    </div>
  );
}
