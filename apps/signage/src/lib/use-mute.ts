'use client';

import { useCallback, useEffect, useState } from 'react';

// 無音/音ありトグル。既定=無音（true）。localStorage に永続（spec §5.5）。
const STORAGE_KEY = 'signage:muted';

export const useMute = (): { muted: boolean; toggle: () => void } => {
  // SSR では localStorage が無いので既定=無音で初期化し、mount 後に読み出す。
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === 'false') setMuted(false);
  }, []);

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { muted, toggle };
};
