'use client';

import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tecnova/ui/components/dropdown-menu';

interface Props {
  // スクリーンリーダー向けの対象名（例: ニックネーム）
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}

// 来場記録の行に付ける「…」メニュー。行やカード全体のクリック（利用者詳細を開く）と干渉しないよう、
// トリガーとメニューのクリックは伝播を止める（メニューは portal だが React のイベントは親へ伝わるため）。
// 編集・削除のダイアログは親で持ち、ここでは開く合図だけを出す。modal={false} にして、
// メニューが閉じる前にダイアログが開いても body のポインター操作がロックされたままにならないようにする。
export function SessionRowActions({ label, onEdit, onDelete }: Props) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`${label}の記録の操作`}
          onClick={(e) => e.stopPropagation()}
        >
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-32"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onEdit}>
          <IconPencil />
          編集
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <IconTrash />
          削除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
