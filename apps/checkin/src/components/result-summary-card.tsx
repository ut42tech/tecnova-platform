'use client';

import { Card, CardContent, CardFooter } from '@tecnova/ui/components/card';
import { Table, TableBody, TableCell, TableRow } from '@tecnova/ui/components/table';
import { cn } from '@tecnova/ui/lib/utils';
import type { ReactNode } from 'react';
import { PanelHeader, type PanelTone } from '@/components/panel-header';

export type SummaryRow = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

export function ResultSummaryCard({
  title,
  icon,
  tone,
  rows,
  note,
  footer,
}: {
  title: string;
  icon: ReactNode;
  tone: Extract<PanelTone, 'emerald' | 'amber'>;
  rows: SummaryRow[];
  note?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex flex-1 bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center">
        <Card className="w-full max-w-2xl shadow-sm">
          <PanelHeader icon={icon} title={title} tone={tone} />
          <CardContent className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-lg border bg-white">
              <Table>
                <TableBody className="text-lg sm:text-xl">
                  {rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="w-36 bg-muted/40 font-bold text-muted-foreground sm:w-44">
                        {row.label}
                      </TableCell>
                      <TableCell className={cn('font-bold', row.valueClassName)}>
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {note ? <p className="text-center text-lg font-bold text-foreground">{note}</p> : null}
          </CardContent>
          <CardFooter>{footer}</CardFooter>
        </Card>
      </div>
    </main>
  );
}
