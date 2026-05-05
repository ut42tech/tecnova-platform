'use client';

import { IconArrowRight, IconBug } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter } from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
import { type FormEvent, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import {
  ID_PATTERN,
  ScanConfirmScreen,
  ScanErrorScreen,
  type ScanFlowState,
  ScanResultScreen,
  ScanSubmittingScreen,
  scanParticipant,
} from '@/components/scan-flow';

export default function ManualPage() {
  const [state, setState] = useState<ScanFlowState>({ kind: 'idle' });
  const [input, setInput] = useState('');

  const runScan = async (value: string) => {
    setState({ kind: 'submitting' });
    try {
      const data = await scanParticipant(value);
      setState({ kind: 'result', data, participantId: value });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!ID_PATTERN.test(input)) return;
    setState({ kind: 'confirming', value: input, source: 'manual' });
  };

  const reset = () => {
    setInput('');
    setState({ kind: 'idle' });
  };

  if (state.kind === 'submitting') {
    return <ScanSubmittingScreen />;
  }

  if (state.kind === 'error') {
    return <ScanErrorScreen message={state.message} onReset={reset} />;
  }

  if (state.kind === 'result') {
    return (
      <ScanResultScreen data={state.data} participantId={state.participantId} onReset={reset} />
    );
  }

  if (state.kind === 'confirming') {
    return (
      <ScanConfirmScreen
        value={state.value}
        source={state.source}
        onCancel={() => setState({ kind: 'idle' })}
        onConfirm={() => void runScan(state.value)}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4">
        <form onSubmit={submitManual} className="w-full">
          <Card className="shadow-sm">
            <PanelHeader
              icon={<IconBug className="size-8" />}
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
                disabled={input.length !== 5}
                className="h-16 w-full text-xl"
              >
                この ID で進む
                <IconArrowRight className="size-6" data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </main>
  );
}
