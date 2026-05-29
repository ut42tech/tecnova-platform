'use client';

import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { Reveal } from '@/components/reveal';
import { authClient } from '@/lib/auth-client';
import { tapScale } from '@/lib/motion';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prefersReduced = useReducedMotion();

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // callbackURL は絶対URLで渡す。相対パスだと Better Auth は authClient の
      // baseURL（= API オリジン）に対して解決してしまい、ログイン後に
      // localhost:8787 に着地する。フロントのオリジンに戻したいので
      // window.location.origin で組み立てる。
      const redirect = `${window.location.origin}/`;
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: redirect,
        errorCallbackURL: redirect,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <PageShell className="items-center justify-center">
      <Reveal className="w-full max-w-md">
        <Card className="w-full border-sky-200 shadow-sm">
          <CardHeader>
            <div className="flex flex-col items-center gap-4 text-center">
              <Image
                src="/logo_tecnova.png"
                alt="TECNOVA"
                width={180}
                height={47}
                priority
                className="h-12 w-auto"
              />
              <div className="flex flex-col gap-1.5">
                <CardTitle className="text-3xl">ようこそ</CardTitle>
                <p className="text-base font-bold text-muted-foreground">
                  うけつけシステムにサインインしてください
                </p>
              </div>
            </div>
          </CardHeader>
          {error && (
            <CardContent>
              <Alert variant="destructive">
                <AlertTitle>ログインエラー</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardContent>
          )}
          <CardFooter className="flex-col gap-3">
            <motion.div className="w-full" whileTap={prefersReduced ? undefined : tapScale}>
              <Button
                type="button"
                size="lg"
                onClick={signIn}
                disabled={busy}
                className="h-14 w-full text-lg"
              >
                <IconBrandGoogleFilled data-icon="inline-start" />
                {busy ? 'リダイレクト中...' : 'Google でログイン'}
              </Button>
            </motion.div>
            <p className="text-center text-sm font-bold text-muted-foreground">
              許可リストに登録されたメンターのみ利用できます
            </p>
          </CardFooter>
        </Card>
      </Reveal>
    </PageShell>
  );
}
