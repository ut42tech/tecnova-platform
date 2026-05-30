'use client';

import type { SignagePlaylistItem, SignagePlaylistResponse } from '@tecnova/shared/schemas';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';
import { FALLBACK_VIDEO_IDS } from '@/config/playlist';

// 起動時 + 数分間隔で /api/signage/playlist を取得し再生キュー（videoId + タイトル）を保持する。
// 取得失敗 / 空配列のときは FALLBACK_VIDEO_IDS を採用（spec §5.1 / §5.4）。
// タイトルは API（YouTube Data API）由来で、サイネージのインフォメーション表示に使う。
const POLL_MS = 5 * 60_000;

const FALLBACK_TRACKS: SignagePlaylistItem[] = FALLBACK_VIDEO_IDS.map((videoId) => ({ videoId }));

export const usePlaylist = (): SignagePlaylistItem[] => {
  const [tracks, setTracks] = useState<SignagePlaylistItem[]>(FALLBACK_TRACKS);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const res = await apiJson<SignagePlaylistResponse>('/api/signage/playlist');
        if (!active) return;
        setTracks(res.items.length > 0 ? res.items : FALLBACK_TRACKS);
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

  return tracks;
};
