'use client';

import { IconPlus } from '@tabler/icons-react';
import type { ParticipantProfileResponse } from '@tecnova/shared/schemas';
import { toJstDateString } from '@tecnova/shared/venue-schedule';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { DataError } from '@tecnova/ui/components/data-error';
import { useMe } from '@tecnova/ui/components/me-provider';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tecnova/ui/components/sheet';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tecnova/ui/components/table';
import { TermBadge } from '@tecnova/ui/components/term-badge';
import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { formatJstDate } from '@tecnova/ui/lib/format';
import { useState } from 'react';
import type { PickedParticipant } from './participant-picker';
import { SessionDeleteDialog } from './session-delete-dialog';
import {
  SessionFormDialog,
  type SessionFormRequest,
  type SessionRecord,
} from './session-form-dialog';
import { SessionRowActions } from './session-row-actions';

interface Props {
  participantId: string | null;
  onOpenChange: (open: boolean) => void;
  // 来場記録を修正したときに親（ダッシュボード）の一覧も再取得させる
  onSessionsChanged?: () => void;
}

// ISO 文字列を JST の 'YYYY/MM/DD HH:mm' に整形する。空なら '—'。
const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

// 履歴テーブル内では幅を抑えるため年を省く。
const fmtHistoryDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

// 滞在分（number）を「Hh Mm」表記にする。0/null は '—'。
const fmtMinutes = (minutes: number | null): string => {
  if (minutes === null || minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
};

export function ParticipantDetailSheet({ participantId, onOpenChange, onSessionsChanged }: Props) {
  const open = participantId !== null;
  // 開いているあいだだけ取得する（閉じている＝path=null で idle）。
  const { state, reload } = useApiResource<ParticipantProfileResponse>(
    participantId ? `/checkin/participants/${encodeURIComponent(participantId)}` : null,
  );
  // 来場記録の修正は admin のみ（API も requireAdmin で守っている）。
  const me = useMe();
  const isAdmin = me.mentor.role === 'admin';
  const [formRequest, setFormRequest] = useState<SessionFormRequest | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<SessionRecord | null>(null);

  // 参加回数などの集計は参照時に計算されるので、詳細を取り直せば修正が反映される。
  const handleChanged = () => {
    reload({ background: true });
    onSessionsChanged?.();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md md:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {state.kind === 'ok' ? state.data.participant.fullName : '利用者の詳細'}
            </SheetTitle>
            <SheetDescription>
              {state.kind === 'ok'
                ? `${state.data.participant.nickname}（${state.data.participant.grade}）`
                : '来場履歴と現在の状態を表示します'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 px-6 pb-8">
            {state.kind === 'loading' && (
              // 実コンテンツ（DetailBody）と同じ骨格のプレースホルダにして、
              // 読み込み完了時のレイアウトの飛びをなくす。
              <>
                <section className="grid gap-3 rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <Skeleton key={i} className={i % 2 === 0 ? 'h-4 w-20' : 'h-4 w-full'} />
                    ))}
                  </div>
                </section>
                <section className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-20" />
                  <div className="flex flex-col gap-2 rounded-lg border p-3">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                </section>
              </>
            )}

            {state.kind === 'error' && <DataError message={state.message} />}

            {state.kind === 'ok' && (
              <DetailBody
                data={state.data}
                isAdmin={isAdmin}
                onAdd={(participant) =>
                  setFormRequest({ mode: 'create', date: toJstDateString(new Date()), participant })
                }
                onEdit={(record) => setFormRequest({ mode: 'edit', record })}
                onDelete={(record) => setDeleteRecord(record)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <SessionFormDialog
        request={formRequest}
        onClose={() => setFormRequest(null)}
        onSaved={handleChanged}
      />
      <SessionDeleteDialog
        record={deleteRecord}
        onClose={() => setDeleteRecord(null)}
        onDeleted={handleChanged}
      />
    </>
  );
}

function DetailBody({
  data,
  isAdmin,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: ParticipantProfileResponse;
  isAdmin: boolean;
  onAdd: (participant: PickedParticipant) => void;
  onEdit: (record: SessionRecord) => void;
  onDelete: (record: SessionRecord) => void;
}) {
  const { participant, stats, current, sessions } = data;
  const picked: PickedParticipant = {
    id: participant.id,
    fullName: participant.fullName,
    nickname: participant.nickname,
    grade: participant.grade,
  };
  const toRecord = (s: ParticipantProfileResponse['sessions'][number]): SessionRecord => ({
    sessionId: s.sessionId,
    participant: picked,
    checkedInAt: s.checkedInAt,
    checkedOutAt: s.checkedOutAt,
  });
  return (
    <>
      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={current.isPresent ? 'default' : 'secondary'}>
            {current.isPresent ? '来場中' : '退出済'}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">{participant.id}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">ID発行日</dt>
          <dd>{formatJstDate(participant.activatedAt)}</dd>
          <dt className="text-muted-foreground">参加回数</dt>
          <dd>
            {stats.participationCount} 回
            <span className="ml-2 text-xs text-muted-foreground">
              （累計来場 {stats.visitCount} 回）
            </span>
          </dd>
          <dt className="text-muted-foreground">直近の来場</dt>
          <dd>{fmtDateTime(stats.lastVisitedAt)}</dd>
          <dt className="text-muted-foreground">累計滞在</dt>
          <dd>{fmtMinutes(stats.totalStayDurationMinutes)}</dd>
          {current.isPresent && current.checkedInAt && (
            <>
              <dt className="text-muted-foreground">本日のチェックイン</dt>
              <dd>{fmtDateTime(current.checkedInAt)}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">来場履歴</h3>
          {isAdmin && (
            <Button type="button" variant="outline" size="xs" onClick={() => onAdd(picked)}>
              <IconPlus data-icon="inline-start" />
              記録を追加
            </Button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            まだ来場履歴はありません
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table className="table-fixed text-[11px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={`h-9 px-1.5 ${isAdmin ? 'w-[34%]' : 'w-[38%]'}`}>
                    入室
                  </TableHead>
                  <TableHead className={`h-9 px-1.5 ${isAdmin ? 'w-[34%]' : 'w-[38%]'}`}>
                    退室
                  </TableHead>
                  <TableHead className={`h-9 px-1.5 ${isAdmin ? 'w-[20%]' : 'w-[24%]'}`}>
                    滞在
                  </TableHead>
                  {isAdmin && (
                    <TableHead className="h-9 w-[12%] px-1">
                      <span className="sr-only">操作</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.sessionId}>
                    <TableCell className="px-1.5 py-2 tabular-nums">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {fmtHistoryDateTime(s.checkedInAt)}
                        {s.term && (
                          <TermBadge
                            term={s.term}
                            counted={s.counted}
                            className="px-1 py-0 text-[10px] leading-tight"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 tabular-nums">
                      {fmtHistoryDateTime(s.checkedOutAt)}
                    </TableCell>
                    <TableCell className="px-1.5 py-2">
                      {fmtMinutes(s.stayDurationMinutes)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="px-1 py-1 text-right">
                        <SessionRowActions
                          label={participant.nickname}
                          onEdit={() => onEdit(toRecord(s))}
                          onDelete={() => onDelete(toRecord(s))}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
