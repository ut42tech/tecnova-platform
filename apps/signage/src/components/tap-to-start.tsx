'use client';

import Image from 'next/image';

// キオスク起動ゲート。タップでチャイム解放・全画面・wake lock を有効化する。
export function TapToStart({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(1rem,3vh,2.25rem)] bg-gradient-to-b from-sky-50 to-white text-slate-900"
    >
      <Image
        src="/logo_tecnova.png"
        alt="tec-nova ながさき"
        width={153}
        height={40}
        priority
        className="h-[clamp(2.75rem,7vh,4.5rem)] w-auto"
      />
      <span className="grid size-[clamp(5rem,12vh,8rem)] place-items-center rounded-full bg-slate-900 text-[clamp(2rem,5vh,3.5rem)] text-white shadow-xl">
        ▶
      </span>
      <span className="text-[clamp(1.5rem,4vw,2.75rem)] font-black">タップして はじめる</span>
      <span className="text-[clamp(0.85rem,1.6vw,1.2rem)] font-bold text-slate-500">
        チャイム・全画面表示を有効にします
      </span>
    </button>
  );
}
