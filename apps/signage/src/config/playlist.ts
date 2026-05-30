// API（/api/signage/playlist）が主ソース。取得失敗・空配列・ローカル開発時のみ
// この配列を自前キューに流す（spec §5.4）。動画 URL ではなく YouTube の videoId を列挙する。
// 例: 'dQw4w9WgXcQ'。空のままなら（API も空なら）動画レイヤ背後のワードマークが見える。
export const FALLBACK_VIDEO_IDS: string[] = [];
