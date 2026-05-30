'use client';

import { useEffect, useState } from 'react';
import { getNow } from './now';

// 表示更新用に一定間隔で現在時刻を返す（チャイム発火は use-chime-scheduler が別途精密に行う）。
export const useNow = (intervalMs = 1000): Date => {
  const [now, setNow] = useState<Date>(() => getNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(getNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};
