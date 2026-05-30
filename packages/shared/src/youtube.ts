// YouTube Data API v3 playlistItems.list の薄いフェッチラッパ。
// googleapis は Node 依存で Workers 非対応のため使わず、API キー + fetch 直叩き。
// google-sheets.ts の「サーバ側 fetch + 資格情報は引数で受け取る」流儀に倣うが、
// OAuth/JWT は不要（APIキーのみ）。順序は snippet.position 昇順、再生不能動画は除外する。

export interface YouTubePlaylistVideo {
  videoId: string;
  title?: string;
}

interface PlaylistItem {
  snippet?: {
    position?: number;
    title?: string;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
  status?: { privacyStatus?: string };
}

interface PlaylistItemsResponse {
  items?: PlaylistItem[];
  nextPageToken?: string;
}

// public / unlisted のみ埋め込み再生可能。private・未指定・削除済み(videoId欠落)は除外。
const PLAYABLE_PRIVACY = new Set(['public', 'unlisted']);

// playlistId の全ページを取得し、再生可能・position 昇順の videoId 列を返す。
// part に複数指定してもクォータは 1 呼び出し 1 ユニットのまま（spec §5.1）。
export const fetchPlaylistVideos = async (
  apiKey: string,
  playlistId: string,
): Promise<YouTubePlaylistVideo[]> => {
  const collected: { position: number; video: YouTubePlaylistVideo }[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails,status');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`YouTube playlistItems fetch failed: ${resp.status} ${body}`);
    }
    const data = (await resp.json()) as PlaylistItemsResponse;

    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      const privacy = item.status?.privacyStatus;
      if (!videoId || !privacy || !PLAYABLE_PRIVACY.has(privacy)) continue;
      collected.push({
        // position 欠落時は末尾送り。元の取得順ではなく position を正とする。
        position: item.snippet?.position ?? Number.MAX_SAFE_INTEGER,
        video: { videoId, title: item.snippet?.title },
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  collected.sort((a, b) => a.position - b.position);
  return collected.map((c) => c.video);
};
