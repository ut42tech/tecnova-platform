import { apiErrorMessage } from '@tecnova/ui/lib/api-client';
import { toast } from 'sonner';

// CRUD 成功時の薄いラッパ。文言の揺れを抑える目的で集約している。
export const toastSuccess = (message: string): void => {
  toast.success(message);
};

// catch ブロックから受け取った unknown を、apiErrorMessage を通して
// 人間向けの文字列にしてトーストにする。
// title を与えれば「メッセージ本文」と分けて表示できる。
export const toastError = (error: unknown, title = 'エラーが発生しました'): void => {
  toast.error(title, { description: apiErrorMessage(error) });
};
