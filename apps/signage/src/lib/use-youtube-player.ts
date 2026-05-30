'use client';

import { useEffect, useRef } from 'react';

// IFrame Player API は @types/youtube がグローバル名前空間 YT を提供する。
// window.YT / onYouTubeIframeAPIReady は型に無いので最小限で宣言する。
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// IFrame Player API を一度だけ読み込むシングルトン。複数回呼んでも <script> は 1 回。
let apiReadyPromise: Promise<typeof YT> | null = null;

const loadYouTubeApi = (): Promise<typeof YT> => {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    // 既存ハンドラがあれば連鎖させる（多重ロード時の保険）。
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT as typeof YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiReadyPromise;
};

interface Args {
  elementId: string;
  videoIds: string[];
  active: boolean; // 活動フェーズ中のみ再生
  muted: boolean; // 無音トグル
  started: boolean; // 起動タップ後（unMute はジェスチャ後のみ）
}

// 生成済み iframe を全画面化し、再生中だけ可視にする（未ロード時は背後のロゴを見せる）。
const styleIframe = (iframe: HTMLIFrameElement, visible: boolean): void => {
  iframe.style.position = 'absolute';
  iframe.style.inset = '0';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.pointerEvents = 'none';
  iframe.style.opacity = visible ? '1' : '0';
};

export const useYoutubePlayer = ({ elementId, videoIds, active, muted, started }: Args): void => {
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const indexRef = useRef(0);
  const queueStartedRef = useRef(false); // 1本目を流し始めたか
  // 最新の props を effect 外から参照するための ref。
  const videoIdsRef = useRef(videoIds);
  const activeRef = useRef(active);
  const mutedRef = useRef(muted);
  const startedRef = useRef(started);
  videoIdsRef.current = videoIds;
  activeRef.current = active;
  mutedRef.current = muted;
  startedRef.current = started;

  // プレーヤー生成は一度だけ（依存は elementId のみ）。StrictMode の二重マウントは
  // destroy で吸収する。active/muted/started/videoIds の変化は別 effect と ref で反映し、
  // プレーヤーの再生成を避ける。
  useEffect(() => {
    let cancelled = false;

    const loadNext = (): void => {
      const ids = videoIdsRef.current;
      const player = playerRef.current;
      if (!player || ids.length === 0) return;
      indexRef.current = (indexRef.current + 1) % ids.length;
      const next = ids[indexRef.current];
      if (next) player.loadVideoById(next);
    };

    const applyMute = (player: YT.Player): void => {
      if (startedRef.current && !mutedRef.current) player.unMute();
      else player.mute();
    };

    void loadYouTubeApi().then((YTApi) => {
      if (cancelled || playerRef.current) return;
      const first = videoIdsRef.current[0];
      queueStartedRef.current = first !== undefined;
      playerRef.current = new YTApi.Player(elementId, {
        videoId: first,
        // controls/fs/kb/関連UI を抑止。rel=0 は限定的だが残す。mute:1 でミュート自動再生を保証。
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          iv_load_policy: 3,
          autoplay: 1,
          mute: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            readyRef.current = true;
            const player = e.target;
            styleIframe(player.getIframe(), queueStartedRef.current);
            if (activeRef.current) player.playVideo();
            else player.pauseVideo();
            applyMute(player);
          },
          // ENDED で次へ差し替え。プレーヤーを「終了状態」に長く留めないことで
          // 関連グリッド/up-next を実質抑止する（spec §5.2）。
          onStateChange: (e) => {
            if (e.data === YTApi.PlayerState.ENDED) loadNext();
          },
          // 100=削除/非公開, 101/150=埋め込み禁止 → 次へ送ってキューを止めない。
          onError: () => loadNext(),
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
      queueStartedRef.current = false;
      indexRef.current = 0;
    };
  }, [elementId]);

  // 生成時に空だった場合の救済：プレイリストが初めて埋まったらキュー先頭から再生開始。
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current || queueStartedRef.current) return;
    const first = videoIds[0];
    if (first === undefined) return;
    queueStartedRef.current = true;
    indexRef.current = 0;
    player.loadVideoById(first);
    styleIframe(player.getIframe(), true);
  }, [videoIds]);

  // 活動フェーズで再生 / それ以外で一時停止。
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (active) player.playVideo();
    else player.pauseVideo();
  }, [active]);

  // 起動タップ後・音ありモードのときだけ unMute。それ以外はミュート。
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (started && !muted) player.unMute();
    else player.mute();
  }, [started, muted]);
};
