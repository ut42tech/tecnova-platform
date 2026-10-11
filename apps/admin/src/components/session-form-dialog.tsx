'use client';

import type { SessionMutationResponse } from '@tecnova/shared/schemas';
import { SESSION_RULE_MESSAGES, validateSessionTimes } from '@tecnova/shared/session-rules';
import {
  jstDateTimeToInstant,
  toJstDateString,
  toJstTimeString,
} from '@tecnova/shared/venue-schedule';
import { Button } from '@tecnova/ui/components/button';
import { Checkbox } from '@tecnova/ui/components/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tecnova/ui/components/dialog';
import { Input } from '@tecnova/ui/components/input';
import { Label } from '@tecnova/ui/components/label';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { toastSuccess } from '@tecnova/ui/lib/toast';
import { useState } from 'react';
import { sessionErrorMessage } from '@/lib/session-error-message';
import { ParticipantPicker, type PickedParticipant } from './participant-picker';

// 編集・削除の対象。ダッシュボードの行と利用者詳細の履歴の両方から組み立てる。
export interface SessionRecord {
  sessionId: string;
  participant: PickedParticipant;
  checkedInAt: string; // ISO 8601 (UTC)
  checkedOutAt: string | null;
}

export type SessionFormRequest =
  | { mode: 'create'; date: string; participant: PickedParticipant | null }
  | { mode: 'edit'; record: SessionRecord };

interface Props {
  // null = 閉じている
  request: SessionFormRequest | null;
  onClose: () => void;
  onSaved: (result: SessionMutationResponse) => void;
}

export function SessionFormDialog({ request, onClose, onSaved }: Props) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {request?.mode === 'edit' ? '来場記録を編集' : '来場記録を追加'}
          </DialogTitle>
          <DialogDescription>時刻は日本時間で入力します。</DialogDescription>
        </DialogHeader>
        {/* 閉じると DialogContent ごとアンマウントされるので、開くたびにフォームの状態が初期化される */}
        {request && <SessionForm request={request} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

interface InitialValues {
  date: string;
  inTime: string;
  outTime: string;
  stillPresent: boolean;
}

const initialValues = (request: SessionFormRequest, today: string): InitialValues => {
  if (request.mode === 'edit') {
    const { checkedInAt, checkedOutAt } = request.record;
    return {
      date: toJstDateString(new Date(checkedInAt)),
      inTime: toJstTimeString(new Date(checkedInAt)),
      outTime: checkedOutAt ? toJstTimeString(new Date(checkedOutAt)) : '',
      stillPresent: checkedOutAt === null,
    };
  }
  // 今日の追加は「今」を入場時刻の初期値にする（チェックイン忘れをその場で直すことが多いため）。
  return {
    date: request.date,
    inTime: request.date === today ? toJstTimeString(new Date()) : '',
    outTime: '',
    stillPresent: false,
  };
};

function SessionForm({
  request,
  onClose,
  onSaved,
}: {
  request: SessionFormRequest;
  onClose: () => void;
  onSaved: (result: SessionMutationResponse) => void;
}) {
  const [today] = useState(() => toJstDateString(new Date()));
  const [initial] = useState(() => initialValues(request, today));
  const [participant, setParticipant] = useState<PickedParticipant | null>(
    request.mode === 'edit' ? request.record.participant : request.participant,
  );
  const [date, setDate] = useState(initial.date);
  const [inTime, setInTime] = useState(initial.inTime);
  const [outTime, setOutTime] = useState(initial.outTime);
  const [stillPresent, setStillPresent] = useState(initial.stillPresent);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isToday = date === today;
  // 「まだ滞在中」は今日の記録だけ（過去日はルール上許されない）。
  const open = isToday && stillPresent;
  const checkedInAt = date && inTime ? jstDateTimeToInstant(date, inTime) : null;
  const checkedOutAt = !open && date && outTime ? jstDateTimeToInstant(date, outTime) : null;
  // 未入力は保存ボタンを押せなくするだけにし、ルール違反だけを文言で知らせる。
  const incomplete =
    participant === null || checkedInAt === null || (!open && checkedOutAt === null);
  const violation =
    !incomplete && checkedInAt !== null
      ? validateSessionTimes({ checkedInAt, checkedOutAt }, new Date())
      : null;

  const save = async () => {
    if (busy || incomplete || violation !== null || participant === null || checkedInAt === null) {
      return;
    }
    setBusy(true);
    setServerError(null);
    const body = {
      participantId: participant.id,
      checkedInAt: checkedInAt.toISOString(),
      checkedOutAt: checkedOutAt ? checkedOutAt.toISOString() : null,
    };
    try {
      const result =
        request.mode === 'edit'
          ? await apiJson<SessionMutationResponse>(
              `/api/sessions/${encodeURIComponent(request.record.sessionId)}`,
              { method: 'PATCH', body },
            )
          : await apiJson<SessionMutationResponse>('/api/sessions', { method: 'POST', body });
      toastSuccess(request.mode === 'edit' ? '来場記録を更新しました' : '来場記録を追加しました');
      onSaved(result);
      onClose();
    } catch (e) {
      setServerError(sessionErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">子ども</span>
        <ParticipantPicker value={participant} onChange={setParticipant} disabled={busy} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-date">日付</Label>
          <Input
            id="session-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-in">入場時刻</Label>
          <Input
            id="session-in"
            type="time"
            value={inTime}
            onChange={(e) => setInTime(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-out">退場時刻</Label>
          <Input
            id="session-out"
            type="time"
            value={open ? '' : outTime}
            onChange={(e) => setOutTime(e.target.value)}
            disabled={busy || open}
          />
        </div>
      </div>
      {isToday ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id="session-present"
            checked={stillPresent}
            onCheckedChange={(v) => setStillPresent(v === true)}
            disabled={busy}
          />
          <Label htmlFor="session-present">まだ滞在中（退場時刻なし）</Label>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">過去の日の記録には退場時刻が必要です。</p>
      )}
      {violation && (
        <p role="alert" className="text-sm text-destructive">
          {SESSION_RULE_MESSAGES[violation]}
        </p>
      )}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {isToday && (
        <p className="text-xs text-muted-foreground">
          今日の記録を変えると、受付端末での次の操作（チェックイン／チェックアウト）が変わります。
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={busy}>
            キャンセル
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy || incomplete || violation !== null}>
          {busy ? '保存中...' : '保存'}
        </Button>
      </DialogFooter>
    </form>
  );
}
