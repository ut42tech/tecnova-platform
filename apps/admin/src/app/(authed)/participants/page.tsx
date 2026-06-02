'use client';

import { IconSearch, IconX } from '@tabler/icons-react';
import { GRADES, type Grade, type ParticipantsListResponse } from '@tecnova/shared/schemas';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card } from '@tecnova/ui/components/card';
import { DataError } from '@tecnova/ui/components/data-error';
import { EmptyState } from '@tecnova/ui/components/empty-state';
import { Input } from '@tecnova/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tecnova/ui/components/select';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tecnova/ui/components/table';
import { TableSkeleton } from '@tecnova/ui/components/table-skeleton';
import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { formatJstDate } from '@tecnova/ui/lib/format';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ParticipantDetailSheet } from '@/components/participant-detail-sheet';
import { RecordCard, RecordField } from '@/components/record-card';
import { Reveal } from '@/components/reveal';

const PAGE_SIZE = 50;

// 「すべて」を表すセンチネル値。SelectItem は空文字 value を受け付けない。
const ANY_GRADE = '__any_grade__';
const ANY_ACTIVE = '__any_active__';

export default function ParticipantsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [grade, setGrade] = useState<string>(ANY_GRADE);
  const [activeFilter, setActiveFilter] = useState<string>(ANY_ACTIVE);
  const [page, setPage] = useState(1);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

  // 入力のたびに API を叩かないよう 300ms デバウンス。
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // フィルタ用 setter。Select の onValueChange に直接渡す。
  // 切替時にページを 1 に戻したいので、setState を併せて呼ぶラッパに分けている
  // （useEffect で副作用にすると、setPage が空依存と判定されて lint が誤検知する）。
  const updateGrade = (v: string) => {
    setGrade(v);
    setPage(1);
  };
  const updateActiveFilter = (v: string) => {
    setActiveFilter(v);
    setPage(1);
  };

  // クエリを path に組み立てる。page/検索/フィルタが変わると path が変わり、
  // useApiResource が自動で再取得する。
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (grade !== ANY_GRADE) params.set('grade', grade);
  if (activeFilter !== ANY_ACTIVE) params.set('active', activeFilter);
  const { state } = useApiResource<ParticipantsListResponse>(
    `/api/participants?${params.toString()}`,
  );

  const totalPages =
    state.kind === 'ok' ? Math.max(1, Math.ceil(state.data.pagination.total / PAGE_SIZE)) : 1;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <Reveal index={0}>
        <PageHeader title="利用者一覧" description="ID発行済みの利用者を検索・フィルタできます" />
      </Reveal>

      <Reveal index={1} className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <IconSearch
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="ID・氏名・ニックネームで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 pl-9"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="検索をクリア"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setSearch('')}
            >
              <IconX />
            </Button>
          )}
        </div>

        <Select value={grade} onValueChange={updateGrade}>
          <SelectTrigger className="w-32" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_GRADE}>学年: すべて</SelectItem>
            {GRADES.map((g: Grade) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={updateActiveFilter}>
          <SelectTrigger className="w-32" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_ACTIVE}>状態: すべて</SelectItem>
            <SelectItem value="true">有効</SelectItem>
            <SelectItem value="false">無効</SelectItem>
          </SelectContent>
        </Select>
      </Reveal>

      {/* loading/error/ok を切り替えるデータ領域。Reveal を常時マウントして入場は一度だけにする
          （検索のたびに再生されない）。フラグメントを含むので gap-6 を再指定。 */}
      <Reveal index={2} className="flex flex-col gap-6">
        {state.kind === 'loading' && (
          <>
            <div className="hidden md:block">
              <TableSkeleton columns={6} rows={10} />
            </div>
            <div className="flex flex-col gap-3 md:hidden">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </>
        )}

        {state.kind === 'error' && <DataError message={state.message} />}

        {state.kind === 'ok' && (
          <>
            {/* モバイル: カードリスト */}
            <div className="flex flex-col gap-3 md:hidden">
              {state.data.participants.length === 0 ? (
                <EmptyState message="該当する利用者が見つかりません" />
              ) : (
                state.data.participants.map((p) => (
                  <RecordCard
                    key={p.id}
                    onClick={() => setSelectedParticipantId(p.id)}
                    ariaLabel={`${p.nickname}（${p.grade}・${p.active ? '有効' : '無効'}）の詳細を開く`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.nickname}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.fullName}・{p.grade}
                        </p>
                      </div>
                      <Badge variant={p.active ? 'default' : 'secondary'}>
                        {p.active ? '有効' : '無効'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <RecordField label="ID">
                        <span className="font-mono text-xs">{p.id}</span>
                      </RecordField>
                      <RecordField label="ID発行日">{formatJstDate(p.activatedAt)}</RecordField>
                    </div>
                  </RecordCard>
                ))
              )}
            </div>

            {/* デスクトップ: テーブル */}
            <Card className="hidden p-0 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>氏名</TableHead>
                    <TableHead>ニックネーム</TableHead>
                    <TableHead>学年</TableHead>
                    <TableHead>ID発行日</TableHead>
                    <TableHead>状態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data.participants.length === 0 ? (
                    <TableRow>
                      <TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>
                        該当する利用者が見つかりません
                      </TableCell>
                    </TableRow>
                  ) : (
                    state.data.participants.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedParticipantId(p.id)}
                      >
                        <TableCell className="font-mono">{p.id}</TableCell>
                        <TableCell>{p.fullName}</TableCell>
                        <TableCell>{p.nickname}</TableCell>
                        <TableCell>{p.grade}</TableCell>
                        <TableCell>{formatJstDate(p.activatedAt)}</TableCell>
                        <TableCell>
                          <Badge variant={p.active ? 'default' : 'secondary'}>
                            {p.active ? '有効' : '無効'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>

            <section className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                全 {state.data.pagination.total} 件 ・ {page} / {totalPages} ページ
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                >
                  最初へ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  前へ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  次へ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                >
                  最後へ
                </Button>
              </div>
            </section>
          </>
        )}
      </Reveal>

      <ParticipantDetailSheet
        participantId={selectedParticipantId}
        onOpenChange={(open) => {
          if (!open) setSelectedParticipantId(null);
        }}
      />
    </main>
  );
}
