'use client';

import { type ChimeEvent, cycleChimeEventsForDay } from '@tecnova/shared/activity-cycle';
import { useEffect, useRef } from 'react';

interface Args {
  enabled: boolean; // 音声解放済みか（起動タップ後）
  isTermActive: (term: ChimeEvent['term']) => boolean; // 稼働判定
  onChime: (event: ChimeEvent) => void; // 発火時の副作用（playChime 等）
  getNow: () => Date;
}

// 壁時計の :00/:50 等の境界でちょうど発火させる。setInterval は使わず、毎 tick
// Date から次境界までの遅延を再計算する（ドリフトしない）。key で二重発火を防ぐ。
export const useChimeScheduler = ({ enabled, isTermActive, onChime, getNow }: Args): void => {
  const isActiveRef = useRef(isTermActive);
  const onChimeRef = useRef(onChime);
  const getNowRef = useRef(getNow);
  isActiveRef.current = isTermActive;
  onChimeRef.current = onChime;
  getNowRef.current = getNow;

  useEffect(() => {
    if (!enabled) return;
    const fired = new Set<string>();
    let last = getNowRef.current().getTime();
    let timer = 0;

    const tick = (): void => {
      const now = getNowRef.current().getTime();
      const events = cycleChimeEventsForDay(new Date(now));
      for (const e of events) {
        const at = e.at.getTime();
        if (at > last && at <= now && !fired.has(e.key)) {
          fired.add(e.key);
          if (isActiveRef.current(e.term)) onChimeRef.current(e);
        }
      }
      last = now;
      const nextAt = events
        .map((e) => e.at.getTime())
        .filter((t) => t > now)
        .sort((a, b) => a - b)[0];
      const delay = nextAt === undefined ? 1000 : Math.min(1000, Math.max(50, nextAt - now));
      timer = window.setTimeout(tick, delay);
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };

    timer = window.setTimeout(tick, 0);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
};
