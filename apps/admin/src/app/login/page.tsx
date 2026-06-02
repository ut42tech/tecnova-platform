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
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { BrandLogo } from '@/components/brand-logo';
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
    <main className="flex min-h-svh flex-1 items-center justify-center bg-muted/30 p-4">
      <Reveal className="w-full max-w-lg">
        <Card className="w-full">
          <CardHeader className="gap-2">
            {/* 直後に「テクノバながさき 運営管理」の文字があるので、ロゴは装飾扱い（alt=""）にして二重読み上げを避ける */}
            <BrandLogo imgClassName="h-11" className="mb-1 w-fit" priority alt="" />
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              テクノバながさき 運営管理
            </p>
            <CardTitle className="text-2xl">管理画面にログイン</CardTitle>
            <CardDescription>
              許可リストに登録された管理者のみログインできます。 Google
              アカウントで認証してください。
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
            <motion.div className="w-full" whileTap={prefersReduced ? undefined : tapScale}>
              <Button type="button" size="lg" onClick={signIn} disabled={busy} className="w-full">
                <IconBrandGoogleFilled data-icon="inline-start" />
                {busy ? 'リダイレクト中...' : 'Google でログイン'}
              </Button>
            </motion.div>
          </CardFooter>
        </Card>
      </Reveal>
    </main>
  );
}
