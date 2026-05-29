import { TERM_LABELS, type TermId } from '@tecnova/shared/venue-schedule';
import { Badge } from '@tecnova/ui/components/badge';
import { cn } from '@tecnova/ui/lib/utils';
import type { ComponentProps } from 'react';

// ターム別の配色。朝=水色 / 昼=黄色 / 夕方=紫 で運営側が一目で区別できるようにする。
// 値の出どころ（区分判定）は packages/shared/venue-schedule に集約しており、
// ここは「TermId → 見た目」だけを担当する。
const TERM_BADGE_CLASSES: Record<TermId, string> = {
  morning: 'bg-sky-100 text-sky-700',
  afternoon: 'bg-amber-100 text-amber-800',
  evening: 'bg-violet-100 text-violet-700',
};

type TermBadgeProps = Omit<ComponentProps<typeof Badge>, 'variant' | 'children'> & {
  term: TermId;
  // 30分ルールで参加回数に数えられない場合は false。色は残しつつ薄く表示する。
  counted?: boolean;
};

// チェックイン時刻のタームを色分けして表示するバッジ。
// `counted=false`（30分ルールで対象外）のときは彩度を落として区別する。
export function TermBadge({ term, counted = true, className, ...props }: TermBadgeProps) {
  return (
    <Badge
      variant="secondary"
      title={counted ? TERM_LABELS[term] : `${TERM_LABELS[term]}（30分ルールでカウント対象外）`}
      className={cn(TERM_BADGE_CLASSES[term], !counted && 'opacity-60', className)}
      {...props}
    >
      {TERM_LABELS[term]}
    </Badge>
  );
}

// 「30分ルールで参加回数に数えない」ことを明示する補助バッジ。
// ターム自体は TermBadge で色分けし、こちらは対象外の事実だけを淡色で添える。
export function UncountedBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant="secondary"
      title="営業時間外、またはターム終了30分前以降の来場のため参加回数に数えません"
      className={cn('bg-slate-100 text-muted-foreground', className)}
      {...props}
    >
      カウント対象外
    </Badge>
  );
}
