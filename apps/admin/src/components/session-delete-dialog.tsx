'use client';

import { toJstDateString, toJstTimeString } from '@tecnova/shared/venue-schedule';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tecnova/ui/components/alert-dialog';
import { ApiError, apiFetch } from '@tecnova/ui/lib/api-client';
import { toastError, toastSuccess } from '@tecnova/ui/lib/toast';
import { useState } from 'react';
import type { SessionRecord } from './session-form-dialog';

// 例: 「26001 たろう（テスト太郎）の 2026-10-04 10:05〜11:40」
const describeRecord = (r: SessionRecord): string => {
  const at = new Date(r.checkedInAt);
  const out = r.checkedOutAt ? toJstTimeString(new Date(r.checkedOutAt)) : '滞在中';
  return `${r.participant.id} ${r.participant.nickname}（${r.participant.fullName}）の ${toJstDateString(at)} ${toJstTimeString(at)}〜${out}`;
};

interface Props {
  // null = 閉じている
  record: SessionRecord | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function SessionDeleteDialog({ record, onClose, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (record === null || busy) return;
    setBusy(true);
    try {
      // 204 を返すので apiJson ではなく apiFetch を使う。
      const r = await apiFetch(`/api/sessions/${encodeURIComponent(record.sessionId)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new ApiError(r.status, body);
      }
      toastSuccess('来場記録を削除しました');
      onDeleted();
      onClose();
    } catch (e) {
      toastError(e, '削除できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={record !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>来場記録を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {record ? `${describeRecord(record)} の記録を削除します。元に戻せません。` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              // 削除が終わるまでダイアログを閉じない（失敗時にもう一度押せるように）。
              e.preventDefault();
              void remove();
            }}
          >
            {busy ? '削除中...' : '削除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
