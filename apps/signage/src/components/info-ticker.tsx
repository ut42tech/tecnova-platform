"use client";

import {
  IconBrandInstagram,
  IconHistory,
  IconPlayerPlayFilled,
  IconServer,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react";
import {
  classifyAttendanceLevel,
  occupancyRatio,
} from "@tecnova/shared/attendance-level";
import type { SignagePlaylistItem } from "@tecnova/shared/schemas";
import { cn } from "@tecnova/ui/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import type { ReactNode } from "react";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/config/info-slides";
import { ATTENDANCE_META } from "@/lib/broadcast";
import {
  tickerLineTransition,
  tickerSlideAnimate,
  tickerSlideExit,
  tickerSlideInitial,
  tickerSlideTransition,
} from "@/lib/motion";
import { usePreviousSummary } from "@/lib/use-previous-summary";
import { useStoryRotation } from "@/lib/use-story-rotation";
import { type HealthStatus, useSystemHealth } from "@/lib/use-system-health";
import { StoryBars } from "./story-bars";
import { StoryProgress } from "./story-progress";

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

const HEALTH_META: Record<HealthStatus, { label: string; dot: string }> = {
  ok: { label: "稼働中", dot: "bg-emerald-500" },
  checking: { label: "接続を確認中…", dot: "bg-slate-400" },
  down: { label: "接続できません", dot: "bg-rose-500" },
};

const prevDateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

// 配信下部の lower-third。来場・にぎわい・稼働状況・公式 Instagram・前回の情報・動画タイトルを巡回。
// 巡回の時間源は useStoryRotation（AnimationFrame）に一本化し、進行バーの満ち＝送りとする。
export function InfoTicker({
  currentTrack,
  present,
  totalCheckedIn,
  debug,
}: Props) {
  const reduced = useReducedMotion();
  const level = classifyAttendanceLevel(present);
  const liveliness = ATTENDANCE_META[level];
  const occ = occupancyRatio(present);
  const health = useSystemHealth();
  const previous = usePreviousSummary();

  const slides: Slide[] = [];
  slides.push({
    id: "attendance",
    icon: <IconUsers />,
    chip: "bg-emerald-100 text-emerald-700",
    label: "いま 会場にいる人",
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
    id: "liveliness",
    icon: <IconSparkles />,
    chip: liveliness.chip,
    label: "かいじょうの にぎわい",
    value: (
      <span className="inline-flex items-center gap-3 align-middle">
        {liveliness.label}
        <span className="inline-block h-[clamp(0.45rem,0.9vw,0.7rem)] w-[clamp(4rem,11vw,10rem)] overflow-hidden rounded-full bg-slate-200 align-middle">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
              liveliness.bar,
            )}
            style={{ width: `${occ * 100}%` }}
          />
        </span>
      </span>
    ),
  });
  slides.push({
    id: "health",
    icon: <IconServer />,
    chip: "bg-slate-100 text-slate-600",
    label: "テクノバながさきプラットフォーム",
    value: (
      <span className="inline-flex items-center gap-2.5 align-middle">
        <span
          className={cn("size-2.5 rounded-full", HEALTH_META[health].dot)}
        />
        {HEALTH_META[health].label}
        <span className="text-[0.6em] font-bold text-slate-400">
          テクノバを支える基盤システム（実は大学生が1人で開発・運用しているよ）
        </span>
      </span>
    ),
  });
  slides.push({
    id: "instagram",
    icon: <IconBrandInstagram />,
    chip: "bg-pink-100 text-pink-700",
    label: "公式インスタグラム",
    value: (
      <>
        @{INSTAGRAM_HANDLE}
        <span className="ml-2 text-[0.62em] font-bold text-slate-400">
          QR をスマホで読みとってね
        </span>
      </>
    ),
  });
  // 前回開催のデータがあるときだけ（後着なので末尾寄りに置きインデックスずれを防ぐ）。
  if (previous) {
    const stay =
      previous.averageStayMinutes !== null
        ? `・平均滞在 ${previous.averageStayMinutes}分`
        : "";
    slides.push({
      id: "previous",
      icon: <IconHistory />,
      chip: "bg-violet-100 text-violet-700",
      label: "前回のテクノバ",
      value: `${prevDateFmt.format(new Date(`${previous.date}T00:00:00+09:00`))}｜${previous.participantCount}人が来場${stay}`,
    });
  }
  // いま流れている動画タイトルは末尾に追加（先頭挿入だと既存スライドの index がずれる）。
  if (currentTrack?.title) {
    slides.push({
      id: "now-playing",
      icon: <IconPlayerPlayFilled />,
      chip: "bg-sky-100 text-sky-700",
      label: "いま流れているどうが",
      value: currentTrack.title,
    });
  }

  const count = slides.length;
  const { index, goTo, advance, animate } = useStoryRotation(count);
  const active = slides[index];

  return (
    <div className="relative flex h-[clamp(4.75rem,9.5vh,7rem)] items-center gap-[clamp(0.75rem,1.6vw,1.5rem)] rounded-2xl bg-white/90 px-[clamp(1rem,2vw,2rem)] shadow-sm ring-1 ring-foreground/10 backdrop-blur">
      {/* アイコンチップ：key 切替時だけ scale + ごく僅かな傾きを1回（spring）。 */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={active.id}
          initial={reduced ? false : { scale: 0.9, rotate: -4, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 26, mass: 0.6 }
          }
          className={cn(
            "grid size-[clamp(2.5rem,4vw,3.5rem)] shrink-0 place-items-center rounded-xl [&>svg]:size-[55%]",
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
              className="line-clamp-2 whitespace-pre-line text-[clamp(1rem,2vw,1.65rem)] font-bold leading-snug text-slate-800"
            >
              {active.value}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Instagram スライド中だけ、QR をティッカー上へ大きくせり出して見せる
          （細い帯に小さく収めると読みづらいため、白カードのコールアウトにする）。 */}
      <AnimatePresence>
        {active.id === "instagram" && (
          <motion.div
            className="absolute right-[clamp(0.75rem,2vw,2.5rem)] bottom-full z-20 mb-[clamp(0.5rem,1.5vh,1.25rem)] flex flex-col items-center gap-[clamp(0.3rem,0.8vh,0.6rem)] rounded-2xl bg-white p-[clamp(0.6rem,1.2vw,1rem)] shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/10"
            initial={reduced ? false : { opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <QRCodeSVG
              value={INSTAGRAM_URL}
              marginSize={2}
              className="size-[clamp(6.5rem,13vh,10rem)]"
            />
            <span className="text-[clamp(0.72rem,1.1vw,0.95rem)] font-bold text-slate-600">
              フォローしてね @{INSTAGRAM_HANDLE}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex shrink-0 items-center gap-[clamp(0.4rem,0.8vw,0.75rem)]">
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
