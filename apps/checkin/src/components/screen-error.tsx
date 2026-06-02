import { IconAlertCircle } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import type { ReactNode } from 'react';

// checkin（iPad キオスク）共通の全画面エラー。bg-rose-50 の全画面 +
// destructive Alert。ページ固有のボタンを actions に、任意の補足
// （ID 行 / 詳細カード等）を footer に渡す。inline の小さなエラーは対象外。
export function CheckinErrorScreen({
  title,
  message,
  actions,
  footer,
}: {
  title: string;
  message: string;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
      <Alert variant="destructive" className="max-w-xl text-left text-lg">
        <IconAlertCircle className="size-6" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {footer}
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">{actions}</div>
    </main>
  );
}
