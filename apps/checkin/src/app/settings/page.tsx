'use client';

import { IconLogout2, IconSettings } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tecnova/ui/components/alert-dialog';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { useMe } from '@tecnova/ui/components/me-provider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tecnova/ui/components/table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function SettingsPage() {
  const me = useMe();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setIsSigningOut(true);
    setError(null);
    try {
      await authClient.signOut();
      router.replace('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsSigningOut(false);
    }
  };

  const rows = [
    { label: 'ログイン名', value: me.user.name },
    { label: 'ログインメール', value: me.user.email },
    { label: 'ユーザーID', value: me.user.id },
    { label: 'メンター名', value: me.mentor.name },
    { label: 'メンターメール', value: me.mentor.email },
    { label: 'ロール', value: <Badge variant="secondary">{me.mentor.role}</Badge> },
    { label: 'メンターID', value: me.mentor.id },
  ];

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4">
        <Card className="border-sky-200 shadow-sm">
          <CardHeader className="gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <IconSettings className="size-7" aria-hidden="true" />
              </div>
              <CardTitle className="text-2xl">設定</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>ログアウトエラー</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="overflow-hidden rounded-lg border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40 bg-muted/40">項目</TableHead>
                    <TableHead>内容</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-base">
                  {rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="bg-muted/30 font-bold text-muted-foreground">
                        {row.label}
                      </TableCell>
                      <TableCell className="break-all whitespace-normal font-bold">
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    disabled={isSigningOut}
                    className="h-14 px-6 text-lg"
                  >
                    <IconLogout2 className="size-6" data-icon="inline-start" />
                    ログアウト
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive">
                      <IconLogout2 className="size-9" aria-hidden="true" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>ログアウトしますか</AlertDialogTitle>
                    <AlertDialogDescription>
                      受付システムを使うには、もう一度 Google ログインが必要です。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel size="lg" disabled={isSigningOut}>
                      キャンセル
                    </AlertDialogCancel>
                    <AlertDialogAction
                      size="lg"
                      variant="destructive"
                      disabled={isSigningOut}
                      onClick={() => void signOut()}
                    >
                      {isSigningOut ? 'ログアウト中' : 'ログアウトする'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
