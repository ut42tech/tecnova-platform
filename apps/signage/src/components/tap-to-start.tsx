'use client';

interface Props {
  onStart: () => void;
}

export function TapToStart({ onStart }: Props) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-slate-950 text-white"
    >
      <span className="text-6xl">▶</span>
      <span className="text-3xl font-extrabold">タップして開始</span>
      <span className="text-base text-slate-400">チャイム・全画面表示を有効にします</span>
    </button>
  );
}
