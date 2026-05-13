'use client';

import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tecnova/ui/components/card';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // callbackURL は絶対URLで渡す。相対パスだと Better Auth は authClient の
      // baseURL（= API オリジン）に対して解決してしまい、ログイン後に
      // localhost:8787 に着地する。フロントのオリジンに戻したいので
      // window.location.origin で組み立てる。
      // trustedOrigins（apps/api/src/lib/auth.ts）に admin の origin が
      // 入っていることが前提。
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
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="gap-2">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            テクノバながさき 運営管理
          </p>
          <CardTitle className="text-2xl">管理画面にログイン</CardTitle>
          <CardDescription>
            許可リストに登録された管理者のみログインできます。 Google アカウントで認証してください。
          </CardDescription>
        </CardHeader>
        {error && (
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>ログインエラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
        <CardFooter>
          <Button type="button" size="lg" onClick={signIn} disabled={busy} className="w-full">
            <IconBrandGoogleFilled data-icon="inline-start" />
            {busy ? 'リダイレクト中...' : 'Google でログイン'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
