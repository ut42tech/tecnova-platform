'use client';

import type { SignagePreviousSummaryResponse } from '@tecnova/shared/schemas';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';

type Previous = SignagePreviousSummaryResponse['previous'];

// 前回開催の来場・滞在データ（集計のみ）。日付をまたぐ可能性に備え1時間ごとに再取得。
// 失敗時は直近値を保持（degrade）。前回開催が無ければ null。
const POLL_MS = 60 * 60_000;

export const usePreviousSummary = (): Previous => {
  const [previous, setPrevious] = useState<Previous>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const res = await apiJson<SignagePreviousSummaryResponse>('/api/signage/previous-summary');
        if (active) setPrevious(res.previous);
      } catch {
        // 直近値を保持。
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return previous;
};
