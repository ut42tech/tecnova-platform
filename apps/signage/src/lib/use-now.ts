'use client';

import { useEffect, useState } from 'react';
import { getNow, subscribeDebug } from './now';

// 表示更新用に一定間隔で現在時刻を返す（チャイム発火は use-chime-scheduler が別途精密に行う）。
// デバッグ操作（ジャンプ/一時停止/速度変更）は subscribeDebug で即時反映する。
export const useNow = (intervalMs = 1000): Date => {
  const [now, setNow] = useState<Date>(() => getNow());
  useEffect(() => {
    const tick = (): void => setNow(getNow());
    const id = window.setInterval(tick, intervalMs);
    const unsub = subscribeDebug(tick);
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, [intervalMs]);
  return now;
};
