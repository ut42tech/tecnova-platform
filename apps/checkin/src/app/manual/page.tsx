'use client';

import {
  IconAlertCircle,
  IconArrowRight,
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
import { type ResourceState, useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { cn } from '@tecnova/ui/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { PanelHeader } from '@/components/panel-header';
import { SegmentedControl } from '@/components/segmented-control';
import { listItemTransition } from '@/lib/motion';
import { PARTICIPANT_ID_PATTERN, participantProfilePath } from '@/lib/participant-id';

type Mode = 'id' | 'name';

export default function ManualPage() {
  const [mode, setMode] = useState<Mode>('id');
  const prefersReduced = useReducedMotion();
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <SegmentedControl
          ariaLabel="入力方法"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'id', label: 'IDで入力', icon: <IconKeyboard className="size-6" /> },
            { value: 'name', label: '名前で探す', icon: <IconSearch className="size-6" /> },
          ]}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          >
            {mode === 'id' ? <IdEntryPanel /> : <NameSearchPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageShell>
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
        <PanelHeader
          icon={<IconKeyboard className="size-8" />}
          title="マニュアル入力"
          tone="slate"
        />
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

function NameSearchPanel() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  // 入力のたびに API を叩かないよう 300ms デバウンス。
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // debouncedQuery が空なら path=null → フックは idle のまま。
  // path が変わるとフックが自動で再取得し、古いレスポンスは cancelled フラグで破棄。
  const searchPath = debouncedQuery
    ? `/checkin/participants/search?${new URLSearchParams({ q: debouncedQuery }).toString()}`
    : null;
  const { state } = useApiResource<ParticipantSearchResponse>(searchPath);

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
          ニックネームか氏名の一部を入力すると、候補が一覧で表示されます。
        </CardDescription>
        <Input
          aria-label="ニックネーム・氏名"
          type="search"
          autoComplete="off"
          autoFocus
          disabled={navigatingId !== null}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: テッくん / 田中太郎"
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
  state: ResourceState<ParticipantSearchResponse>;
  navigatingId: string | null;
  onSelect: (id: string) => void;
}) {
  const prefersReduced = useReducedMotion();
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

  if (state.data.participants.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-white px-5 py-8 text-center text-base text-muted-foreground">
        「{query}」に一致する参加者が見つかりませんでした
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-muted-foreground">
        {state.data.participants.length}件の候補（タップして開く）
      </p>
      <ul className="flex max-h-[60vh] list-none flex-col gap-2 overflow-y-auto p-0">
        {state.data.participants.map((participant, index) => (
          <motion.li
            key={participant.id}
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={listItemTransition(index)}
          >
            <ResultRow
              participant={participant}
              isNavigating={navigatingId === participant.id}
              disabled={navigatingId !== null && navigatingId !== participant.id}
              onSelect={() => onSelect(participant.id)}
            />
          </motion.li>
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
        <p className="truncate text-sm font-bold text-muted-foreground">{participant.fullName}</p>
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
