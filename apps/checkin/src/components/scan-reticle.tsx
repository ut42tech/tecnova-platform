// 映像枠に重ねる QR スキャン演出。スキャン対象の四隅を示す角ブラケットを静的に表示する。
// pointer-events-none で下のビデオ操作を妨げない。アニメーションは持たない。
const CORNER_CLASSES = [
  'left-0 top-0 rounded-tl-xl border-l-4 border-t-4',
  'right-0 top-0 rounded-tr-xl border-r-4 border-t-4',
  'left-0 bottom-0 rounded-bl-xl border-b-4 border-l-4',
  'right-0 bottom-0 rounded-br-xl border-b-4 border-r-4',
] as const;

export function ScanReticle() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 sm:p-10">
      <div className="relative aspect-square h-full max-h-[72%] max-w-[72%]">
        {CORNER_CLASSES.map((pos) => (
          <span
            key={pos}
            className={`absolute size-10 border-white/90 ${pos}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
