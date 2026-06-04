'use client';

import { Button } from '@tecnova/ui/components/button';
import { DataError } from '@tecnova/ui/components/data-error';

// ルート段の Error Boundary（(authed) の境界で拾えなかった描画クラッシュの受け皿）。
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <div className="w-full max-w-md">
        <DataError
          title="エラーが発生しました"
          message={error.message || '予期しないエラーが発生しました'}
        />
      </div>
      <Button type="button" variant="outline" onClick={reset}>
        再試行
      </Button>
    </main>
  );
}
