'use client';

import type { ParticipantsListResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card } from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tecnova/ui/components/table';
import { apiErrorMessage, apiJson } from '@tecnova/ui/lib/api-client';
import { formatJstDate } from '@tecnova/ui/lib/format';
import { useEffect, useState } from 'react';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: ParticipantsListResponse }
  | { kind: 'error'; message: string };

const PAGE_SIZE = 50;

export default function ParticipantsPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // 入力のたびに API を叩かないよう 300ms デバウンス。
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    void (async () => {
      setState({ kind: 'loading' });
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        const data = await apiJson<ParticipantsListResponse>(
          `/api/participants?${params.toString()}`,
        );
        setState({ kind: 'ok', data });
      } catch (e) {
        setState({ kind: 'error', message: apiErrorMessage(e) });
      }
    })();
  }, [debouncedSearch, page]);

  const totalPages =
    state.kind === 'ok' ? Math.max(1, Math.ceil(state.data.pagination.total / PAGE_SIZE)) : 1;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <section className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">参加者一覧</h2>
        <Input
          type="search"
          placeholder="ニックネームで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </section>

      {state.kind === 'loading' && <Skeleton className="h-6 w-32" />}

      {state.kind === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.kind === 'ok' && (
        <>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>ニックネーム</TableHead>
                  <TableHead>学年</TableHead>
                  <TableHead>アクティベート日</TableHead>
                  <TableHead>状態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.data.participants.length === 0 ? (
                  <TableRow>
                    <TableCell className="py-6 text-center text-muted-foreground" colSpan={5}>
                      該当データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  state.data.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">{p.id}</TableCell>
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

          <section className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              全 {state.data.pagination.total} 件中 {state.data.participants.length} 件表示
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                前へ
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                次へ
              </Button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
