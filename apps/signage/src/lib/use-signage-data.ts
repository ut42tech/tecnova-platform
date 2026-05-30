'use client';

import type { TodaySessionsResponse } from '@tecnova/shared/schemas';
import type { TermId } from '@tecnova/shared/venue-schedule';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';

export interface SignageData {
  currentlyPresent: number;
  totalCheckedIn: number;
  termCounts: Record<TermId, number>;
}

const EMPTY: SignageData = {
  currentlyPresent: 0,
  totalCheckedIn: 0,
  termCounts: { morning: 0, afternoon: 0, evening: 0 },
};

const POLL_MS = 20_000;

// 認証付き /api/sessions/today を ~20秒間隔で取得。ターム別 checkedIn は
// sessions[].term の件数（累計＝ターム終了まで sticky）。失敗時は直近値を保持。
export const useSignageData = (): SignageData => {
  const [data, setData] = useState<SignageData>(EMPTY);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const res = await apiJson<TodaySessionsResponse>('/api/sessions/today');
        if (!active) return;
        const termCounts: Record<TermId, number> = { morning: 0, afternoon: 0, evening: 0 };
        for (const s of res.sessions) {
          if (s.term) termCounts[s.term] += 1;
        }
        setData({
          currentlyPresent: res.summary.currentlyPresent,
          totalCheckedIn: res.summary.totalCheckedIn,
          termCounts,
        });
      } catch {
        // ネットワーク不達時は直近値を維持（degrade）。
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return data;
};
