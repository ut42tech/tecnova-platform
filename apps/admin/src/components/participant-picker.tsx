'use client';

import type { ParticipantsListResponse } from '@tecnova/shared/schemas';
import { Button } from '@tecnova/ui/components/button';
import { Input } from '@tecnova/ui/components/input';
import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { useState } from 'react';

export interface PickedParticipant {
  id: string;
  fullName: string;
  nickname: string;
  grade: string;
}

// 一覧・確認ダイアログでも同じ表記にするため export する。メイン識別子はニックネーム。
export const participantLabel = (p: PickedParticipant): string =>
  `${p.nickname}（${p.fullName}）・${p.grade}・${p.id}`;

interface Props {
  value: PickedParticipant | null;
  onChange: (participant: PickedParticipant | null) => void;
  disabled?: boolean;
}

// 来場記録の子を選ぶ。選択済みなら表示＋「変更」（＝別の子への付け替え）、未選択なら検索欄を出す。
// 検索は既存の /api/participants?search=（ID・氏名・ニックネームの部分一致）を使う。
export function ParticipantPicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const { state } = useApiResource<ParticipantsListResponse>(
    value === null && trimmed.length > 0
      ? `/api/participants?search=${encodeURIComponent(trimmed)}&limit=8`
      : null,
  );

  if (value !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="min-w-0 truncate text-sm">{participantLabel(value)}</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          onClick={() => {
            setQuery('');
            onChange(null);
          }}
        >
          変更
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ID・氏名・ニックネームで検索"
        aria-label="子どもを検索"
        disabled={disabled}
      />
      {state.kind === 'loading' && <p className="text-xs text-muted-foreground">検索中...</p>}
      {state.kind === 'error' && <p className="text-xs text-destructive">{state.message}</p>}
      {state.kind === 'ok' &&
        (state.data.participants.length === 0 ? (
          <p className="text-xs text-muted-foreground">見つかりません</p>
        ) : (
          <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border">
            {state.data.participants.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() =>
                    onChange({
                      id: p.id,
                      fullName: p.fullName,
                      nickname: p.nickname,
                      grade: p.grade,
                    })
                  }
                >
                  {participantLabel(p)}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
