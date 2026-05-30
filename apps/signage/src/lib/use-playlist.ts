'use client';

import type { SignagePlaylistResponse } from '@tecnova/shared/schemas';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';
import { FALLBACK_VIDEO_IDS } from '@/config/playlist';

// 起動時 + 数分間隔で /api/signage/playlist を取得し videoId[] を保持する。
// 取得失敗 / 空配列のときは FALLBACK_VIDEO_IDS を採用（spec §5.1 / §5.4）。
const POLL_MS = 5 * 60_000;

export const usePlaylist = (): string[] => {
  const [ids, setIds] = useState<string[]>(FALLBACK_VIDEO_IDS);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const res = await apiJson<SignagePlaylistResponse>('/api/signage/playlist');
        if (!active) return;
        const next = res.items.map((i) => i.videoId);
        setIds(next.length > 0 ? next : FALLBACK_VIDEO_IDS);
      } catch {
        // 取得失敗時は直近の状態を保持（degrade）。初回失敗なら FALLBACK のまま。
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return ids;
};
