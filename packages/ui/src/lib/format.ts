// 日付/時刻フォーマットの共通ヘルパ。アプリ間で重複しやすい
// `Intl.DateTimeFormat` 呼び出しをここに集約する。

// UTC ISO 文字列を JST の YYYY/MM/DD 表記に整形する。
// null 入力時は fallback（既定は em-dash）を返す。
export const formatJstDate = (iso: string | null | undefined, fallback = '—'): string => {
  if (!iso) return fallback;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
};
