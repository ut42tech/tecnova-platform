'use client';

import {
  IconAlertCircle,
  IconArrowRight,
  IconBug,
  IconChevronRight,
  IconKeyboard,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import type { ParticipantSearchResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter } from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { cn } from '@tecnova/ui/lib/utils';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import { apiFetch, readErrorMessage } from '@/lib/api';
import { PARTICIPANT_ID_PATTERN, participantProfilePath } from '@/lib/participant-id';

type Mode = 'id' | 'name';

export default function ManualPage() {
  const [mode, setMode] = useState<Mode>('id');

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === 'id' ? <IdEntryPanel /> : <NameSearchPanel />}
      </div>
    </main>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="入力方法"
      className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 shadow-sm"
    >
      <ToggleButton
        active={mode === 'id'}
        onClick={() => onChange('id')}
        icon={<IconKeyboard className="size-6" data-icon="inline-start" />}
        label="IDで入力"
      />
      <ToggleButton
        active={mode === 'name'}
        onClick={() => onChange('name')}
        icon={<IconSearch className="size-6" data-icon="inline-start" />}
        label="名前で探す"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Button
      type="button"
      role="tab"
      aria-selected={active}
      variant={active ? 'default' : 'ghost'}
      size="lg"
      className="h-14 text-lg font-bold"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

function IdEntryPanel() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!PARTICIPANT_ID_PATTERN.test(input)) return;
    setIsNavigating(true);
    router.push(participantProfilePath(input));
  };

  return (
    <form onSubmit={submitManual} className="w-full">
      <Card className="shadow-sm">
        <PanelHeader icon={<IconBug className="size-8" />} title="マニュアル入力" tone="slate" />
        <CardContent className="flex flex-col gap-4">
          <CardDescription className="text-lg text-foreground">
            参加者IDがわかる場合は、5桁の数字を入力してください。
          </CardDescription>
          <Input
            aria-label="参加者ID"
            type="text"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            required
            autoComplete="off"
            autoFocus
            disabled={isNavigating}
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="00000"
            className="h-20 rounded-lg bg-white text-center text-5xl font-black tabular-nums"
          />
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            size="lg"
            disabled={input.length !== 5 || isNavigating}
            className="h-16 w-full text-xl"
          >
            {isNavigating ? 'プロフィールを開いています' : 'この ID で進む'}
            <IconArrowRight className="size-6" data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; results: ParticipantSearchResponse['participants'] }
  | { kind: 'error'; message: string };

const searchParticipants = async (
  query: string,
  signal: AbortSignal,
): Promise<ParticipantSearchResponse> => {
  const params = new URLSearchParams({ q: query });
  const response = await apiFetch(`/checkin/participants/search?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as ParticipantSearchResponse;
};

function NameSearchPanel() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  // 入力のたびに API を叩かないよう 300ms デバウンス。
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setState({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const data = await searchParticipants(debouncedQuery, controller.signal);
        setState({ kind: 'ok', results: data.participants });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => controller.abort();
  }, [debouncedQuery]);

  const handleSelect = (participantId: string) => {
    if (navigatingId) return;
    setNavigatingId(participantId);
    router.push(participantProfilePath(participantId));
  };

  return (
    <Card className="shadow-sm">
      <PanelHeader icon={<IconSearch className="size-8" />} title="名前で探す" tone="slate" />
      <CardContent className="flex flex-col gap-4">
        <CardDescription className="text-lg text-foreground">
          ニックネームの一部を入力すると、候補が一覧で表示されます。
        </CardDescription>
        <Input
          aria-label="ニックネーム"
          type="search"
          autoComplete="off"
          autoFocus
          disabled={navigatingId !== null}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: テッくん"
          className="h-16 rounded-lg bg-white px-5 text-2xl"
        />
        <SearchResults
          query={debouncedQuery}
          state={state}
          navigatingId={navigatingId}
          onSelect={handleSelect}
        />
      </CardContent>
    </Card>
  );
}

function SearchResults({
  query,
  state,
  navigatingId,
  onSelect,
}: {
  query: string;
  state: SearchState;
  navigatingId: string | null;
  onSelect: (id: string) => void;
}) {
  if (state.kind === 'idle') {
    return (
      <p className="rounded-lg border border-dashed bg-white px-5 py-8 text-center text-base text-muted-foreground">
        ニックネームを入力すると候補が表示されます
      </p>
    );
  }

  if (state.kind === 'loading') {
    return (
      <ul className="flex list-none flex-col gap-2 p-0">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Skeleton className="h-20 w-full rounded-lg" />
          </li>
        ))}
      </ul>
    );
  }

  if (state.kind === 'error') {
    return (
      <Alert variant="destructive">
        <IconAlertCircle className="size-5" aria-hidden="true" />
        <AlertTitle>検索に失敗しました</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  if (state.results.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-white px-5 py-8 text-center text-base text-muted-foreground">
        「{query}」に一致する参加者が見つかりませんでした
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-muted-foreground">
        {state.results.length}件の候補（タップして開く）
      </p>
      <ul className="flex max-h-[60vh] list-none flex-col gap-2 overflow-y-auto p-0">
        {state.results.map((participant) => (
          <li key={participant.id}>
            <ResultRow
              participant={participant}
              isNavigating={navigatingId === participant.id}
              disabled={navigatingId !== null && navigatingId !== participant.id}
              onSelect={() => onSelect(participant.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultRow({
  participant,
  isNavigating,
  disabled,
  onSelect,
}: {
  participant: ParticipantSearchResponse['participants'][number];
  isNavigating: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left transition-colors',
        'hover:border-sky-300 hover:bg-sky-50 active:bg-sky-100',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <div
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"
      >
        <IconUser className="size-7" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-bold leading-tight">{participant.nickname}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge
            variant="secondary"
            style={{ height: 'auto' }}
            className="px-2.5 py-1 text-sm tabular-nums"
          >
            ID {participant.id}
          </Badge>
          <Badge variant="secondary" style={{ height: 'auto' }} className="px-2.5 py-1 text-sm">
            {participant.grade}
          </Badge>
        </div>
      </div>
      <IconChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
      {isNavigating ? <span className="sr-only">プロフィールを開いています</span> : null}
    </button>
  );
}
