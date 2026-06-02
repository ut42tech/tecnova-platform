'use client';

import { Button } from '@tecnova/ui/components/button';
import { DataError } from '@tecnova/ui/components/data-error';

// 認証必須セクションの描画時クラッシュを拾う Error Boundary。
// 各ページの try/catch では拾えない描画中の throw をここで受ける。
// error.tsx は Client Component 必須。
export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
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
