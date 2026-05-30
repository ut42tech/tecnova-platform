'use client';

import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { useState } from 'react';
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
    <main className="flex min-h-svh items-center justify-center bg-slate-950 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">テクノバ サイネージ</CardTitle>
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
    </main>
  );
}
