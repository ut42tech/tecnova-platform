import type { TermId } from '@tecnova/shared/venue-schedule';

// ============================================================================
// 時刻ソース
// ============================================================================
// 端末のローカル時計を返す。?now=ISO クエリ（実速進行）に加え、?debug=1 のときは
// 下のデバッグストアによる擬似時計（倍速・一時停止・ジャンプ）で上書きできる。
// getNow はレンダーに依存しない純粋な読み取りなので、useNow とチャイムスケジューラの
// 双方が同じ時刻を引ける。

interface Anchor {
  base: number;
  mountedAt: number;
}

let anchor: Anchor | null | undefined;

const readAnchor = (): Anchor | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('now');
  if (!raw) return null;
  const base = new Date(raw).getTime();
  if (Number.isNaN(base)) return null;
  return { base, mountedAt: Date.now() };
};

// ============================================================================
// デバッグ（プレビュー）ストア
// ============================================================================
// React 外の module-singleton。?debug=1 のときだけ有効化し、擬似時計＋稼働強制を
// 提供する。本番（?debug 無し）では debugEnabled=false のまま全分岐が短絡し、挙動は
// 従来と完全に同一。UI 側は useSyncExternalStore で購読する。

interface Override {
  base: number; // 擬似now の基準（UTC ms）
  mountedAt: number; // base を据えた実 Date.now()
  speed: number; // 倍率（1=等速）
  playing: boolean; // 進行中か
}

export interface DebugSnapshot {
  debugEnabled: boolean;
  hasOverride: boolean;
  speed: number;
  playing: boolean;
  forcedActiveTerms: readonly TermId[];
  jumpEpoch: number;
}

interface DebugInternal {
  debugEnabled: boolean;
  override: Override | null;
  forcedActiveTerms: Set<TermId>;
  jumpEpoch: number;
}

const internal: DebugInternal = {
  debugEnabled: false,
  override: null,
  forcedActiveTerms: new Set(),
  jumpEpoch: 0,
};

const listeners = new Set<() => void>();

// useSyncExternalStore は getSnapshot の参照安定を要求するため、変化時のみ再生成する。
const buildSnapshot = (): DebugSnapshot => ({
  debugEnabled: internal.debugEnabled,
  hasOverride: internal.override !== null,
  speed: internal.override?.speed ?? 1,
  playing: internal.override?.playing ?? true,
  forcedActiveTerms: [...internal.forcedActiveTerms],
  jumpEpoch: internal.jumpEpoch,
});

let snapshot: DebugSnapshot = buildSnapshot();

// SSR と CSR 初回（hydration）で必ず一致する固定スナップショット。
const SERVER_SNAPSHOT: DebugSnapshot = {
  debugEnabled: false,
  hasOverride: false,
  speed: 1,
  playing: true,
  forcedActiveTerms: [],
  jumpEpoch: 0,
};

const notify = (): void => {
  snapshot = buildSnapshot();
  for (const l of listeners) l();
};

export const subscribeDebug = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const getDebugSnapshot = (): DebugSnapshot => snapshot;
export const getDebugServerSnapshot = (): DebugSnapshot => SERVER_SNAPSHOT;

// 現在の擬似now（ms）。override 進行を含む。
const debugNowMs = (): number => {
  const o = internal.override;
  if (!o) return Date.now();
  return o.playing ? o.base + (Date.now() - o.mountedAt) * o.speed : o.base;
};

// speed / playing 変更前に現在の擬似now を base に確定する（連続性を保ち時刻を飛ばさない）。
const reanchor = (): void => {
  if (!internal.override) return;
  internal.override = {
    ...internal.override,
    base: debugNowMs(),
    mountedAt: Date.now(),
  };
};

// ?debug=1 判定（クライアントのみ）。
export const isDebugQueryEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const v = new URLSearchParams(window.location.search).get('debug');
  return v !== null && v !== '0' && v !== 'false';
};

export const enableDebug = (): void => {
  if (internal.debugEnabled) return;
  internal.debugEnabled = true;
  // ?now= が付いていれば、その時刻を擬似時計の初期 base にする。
  if (anchor === undefined) anchor = readAnchor();
  if (anchor !== null) {
    internal.override = {
      base: anchor.base + (Date.now() - anchor.mountedAt),
      mountedAt: Date.now(),
      speed: 1,
      playing: true,
    };
  }
  notify();
};

// 擬似now を ms へジャンプ（不連続）。speed=1・playing=true に揃え、世代を進める
// （スケジューラはこの世代変化を見て過去境界の一斉発火を抑止する）。
export const debugJumpTo = (ms: number): void => {
  internal.override = { base: ms, mountedAt: Date.now(), speed: 1, playing: true };
  internal.jumpEpoch += 1;
  notify();
};

export const debugSetSpeed = (speed: number): void => {
  if (!internal.override) {
    internal.override = { base: Date.now(), mountedAt: Date.now(), speed, playing: true };
  } else {
    reanchor();
    internal.override = { ...internal.override, speed };
  }
  notify();
};

export const debugPlay = (): void => {
  if (!internal.override) return;
  reanchor();
  internal.override = { ...internal.override, playing: true };
  notify();
};

export const debugPause = (): void => {
  if (!internal.override) {
    internal.override = { base: Date.now(), mountedAt: Date.now(), speed: 1, playing: false };
  } else {
    reanchor();
    internal.override = { ...internal.override, playing: false };
  }
  notify();
};

export const debugSetForcedActive = (term: TermId, on: boolean): void => {
  const next = new Set(internal.forcedActiveTerms);
  if (on) next.add(term);
  else next.delete(term);
  internal.forcedActiveTerms = next;
  notify();
};

export const debugToggleForcedActive = (term: TermId): void => {
  debugSetForcedActive(term, !internal.forcedActiveTerms.has(term));
};

export const debugReset = (): void => {
  internal.override = null;
  internal.forcedActiveTerms = new Set();
  internal.jumpEpoch += 1;
  // 「実時刻に戻す」なので ?now アンカーも解除し、getNow を実時刻（分岐3）へ完全に戻す。
  anchor = null;
  notify();
};

// ============================================================================
// getNow（優先順位: デバッグ擬似時計 → ?now アンカー → 実時刻）
// ============================================================================
export const getNow = (): Date => {
  // (1) デバッグ擬似時計（?debug=1 + override）
  if (internal.debugEnabled && internal.override) {
    return new Date(debugNowMs());
  }
  // (2) ?now= アンカー（実速進行・従来動作）
  if (anchor === undefined) anchor = readAnchor();
  if (anchor !== null) {
    return new Date(anchor.base + (Date.now() - anchor.mountedAt));
  }
  // (3) 実時刻
  return new Date();
};
