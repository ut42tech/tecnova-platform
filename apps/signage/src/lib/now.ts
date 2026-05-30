// 端末のローカル時計を返す。?now=ISO クエリがある場合のみ、その時刻を起点に
// 実時間の経過分だけ進めた擬似時刻を返す（タイムベース挙動の手動検証用）。
let anchor: { base: number; mountedAt: number } | null | undefined;

const readAnchor = (): { base: number; mountedAt: number } | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('now');
  if (!raw) return null;
  const base = new Date(raw).getTime();
  if (Number.isNaN(base)) return null;
  return { base, mountedAt: Date.now() };
};

export const getNow = (): Date => {
  if (anchor === undefined) anchor = readAnchor();
  if (anchor === null) return new Date();
  return new Date(anchor.base + (Date.now() - anchor.mountedAt));
};
