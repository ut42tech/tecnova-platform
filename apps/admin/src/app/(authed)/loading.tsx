import { Skeleton } from '@tecnova/ui/components/skeleton';

// ソフトナビ時のコンテンツスケルトン。即時シェル化により AppShell（サイドバー等）は
// 保たれるため、本文スロットだけがこのフォールバックに置き換わる。
export default function AuthedLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
