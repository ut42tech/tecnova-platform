const jstHmFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// JST の 'HH:mm'。
export const jstHm = (date: Date): string => jstHmFormatter.format(date);

// 秒数を 'M:SS' に（休憩カウントダウン用）。負値は 0 扱い。
export const mmss = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};
