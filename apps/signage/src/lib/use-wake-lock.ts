'use client';

import { useEffect } from 'react';

// 画面スリープ防止。document が hidden になると OS が自動解放するため
// visibilitychange で再取得する。HTTPS（secure context）必須。
export const useWakeLock = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;

    const request = async (): Promise<void> => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // low battery / hidden などで拒否されうる（ベストエフォート）。
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
};
