import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';

interface DataErrorProps {
  title?: string;
  message: string;
}

// 取得失敗時の共通エラー表示。admin 各画面でインライン重複していた
// destructive Alert を 1 箇所に集約する。
export function DataError({ title = '読み込めませんでした', message }: DataErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
