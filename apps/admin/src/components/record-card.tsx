'use client';

import { cn } from '@tecnova/ui/lib/utils';

interface RecordCardProps {
  /** 指定するとカード全体がタップ可能になる（一覧→詳細など） */
  onClick?: () => void;
  /** タップ可能なときのアクセシブルネーム（スクリーンリーダー向け） */
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

const BASE = 'rounded-2xl border bg-card p-4 text-card-foreground shadow-xs';

// モバイルでテーブルの代わりに使うカード。全ページで見た目を揃えるための共通チップ。
// onClick を渡すとカード全面に重ねた <button> でタップ可能にする
// （div + role=button よりアクセシブルで、キーボード操作も標準で効く）。
// タップ可能カードは内部に他のインタラクティブ要素を持たない前提。
export function RecordCard({ onClick, ariaLabel, className, children }: RecordCardProps) {
  if (onClick === undefined) {
    return <div className={cn(BASE, className)}>{children}</div>;
  }
  return (
    <div
      className={cn(
        BASE,
        'relative transition-colors hover:bg-muted/50 has-[button:active]:bg-muted',
        className,
      )}
    >
      {children}
      <button
        type="button"
        aria-label={ariaLabel ?? '詳細を開く'}
        onClick={onClick}
        className="absolute inset-0 rounded-[inherit] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      />
    </div>
  );
}

interface RecordFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

// カード内の「ラベル : 値」行。左にラベル、右に値。
export function RecordField({ label, children, className }: RecordFieldProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
