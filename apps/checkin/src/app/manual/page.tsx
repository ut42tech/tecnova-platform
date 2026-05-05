'use client';

import { IconArrowRight, IconBug } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter } from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import { PARTICIPANT_ID_PATTERN, participantProfilePath } from '@/lib/participant-id';

export default function ManualPage() {
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
      </div>
    </main>
  );
}
