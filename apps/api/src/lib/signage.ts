import type { SignagePlaylistResponse } from '@tecnova/shared/schemas';
import { fetchPlaylistVideos, type YouTubePlaylistVideo } from '@tecnova/shared/youtube';
import type { Bindings } from '../types';

// プレイリストはサーバ側で数分キャッシュする。Data API のクォータ節約と、プレイリスト
// 更新の反映遅延（数分）は許容（spec §5.1）。Workers がリサイクルされたら自然に再取得。
const CACHE_TTL_MS = 5 * 60_000;

let cache: { items: YouTubePlaylistVideo[]; expiresAt: number } | null = null;

export const fetchSignagePlaylist = async (env: Bindings): Promise<SignagePlaylistResponse> => {
  const now = Date.now();
  if (!cache || cache.expiresAt <= now) {
    const items = await fetchPlaylistVideos(env.YOUTUBE_API_KEY, env.YOUTUBE_PLAYLIST_ID);
    cache = { items, expiresAt: now + CACHE_TTL_MS };
  }
  return { items: cache.items, refreshAt: new Date(cache.expiresAt).toISOString() };
};
