import { cn } from '@tecnova/ui/lib/utils';
import Image from 'next/image';

// tec-nova Nagasaki 公式ロゴ。サイドバー / トップバー / ログインで共用する。
// ロゴのワードマークは暗色なので、ダークモードの暗い面では視認できなくなる。
// そのためダークモードでだけ白いプレートを敷いて色味ごと見せる（ライトでは枠なし＝余白のみ）。
// 元画像のアスペクト比は 2277:597 ≈ 3.81:1。高さは imgClassName（例: 'h-7'）で指定する。
export function BrandLogo({
  imgClassName = 'h-7',
  className,
  priority,
  // 隣にブランド名テキストがある場所（ログイン画面）では alt="" を渡して
  // スクリーンリーダーの二重読み上げを避ける。既定は情報を持つロゴとして読ませる。
  alt = 'tec-nova Nagasaki',
}: {
  imgClassName?: string;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg p-1 ring-1 ring-transparent dark:bg-white dark:ring-black/5',
        className,
      )}
    >
      <Image
        src="/logo_tecnova.png"
        alt={alt}
        width={2277}
        height={597}
        priority={priority}
        className={cn('w-auto', imgClassName)}
      />
    </span>
  );
}
