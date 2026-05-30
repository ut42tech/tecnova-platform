'use client';

import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import Image from 'next/image';
import { useState } from 'react';
import { Reveal } from '@/components/reveal';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // callbackURL は絶対URL（フロントのオリジンに戻す）。相対だと API オリジンに着地する。
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
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-b from-sky-50 to-white p-8">
      <Reveal className="w-full max-w-md">
        <Card>
          <CardHeader>
            <div className="flex flex-col items-center gap-3 text-center">
              <Image
                src="/logo_tecnova.png"
                alt="tec-nova ながさき"
                width={153}
                height={40}
                priority
                className="h-10 w-auto"
              />
              <CardTitle className="text-2xl">サイネージ表示</CardTitle>
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
            <Button type="button" size="lg" onClick={signIn} disabled={busy} className="w-full">
              {busy ? 'リダイレクト中...' : 'Google でログイン（共有アカウント）'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              許可リストに登録されたアカウントのみ利用できます
            </p>
          </CardFooter>
        </Card>
      </Reveal>
    </main>
  );
}
