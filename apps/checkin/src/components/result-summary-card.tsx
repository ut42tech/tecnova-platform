'use client';

import { Card, CardContent, CardFooter } from '@tecnova/ui/components/card';
import { Table, TableBody, TableCell } from '@tecnova/ui/components/table';
import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { PanelHeader, type PanelTone } from '@/components/panel-header';
import { SuccessIcon } from '@/components/success-icon';

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
  const prefersReduced = useReducedMotion();
  const footerDelay = 0.15 + rows.length * 0.05 + 0.05;

  return (
    <main className="flex flex-1 bg-gradient-to-b from-sky-50 to-white p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center">
        <motion.div
          className="w-full max-w-2xl"
          initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={prefersReduced ? undefined : { duration: 0.35, ease: 'easeOut' }}
        >
          <Card className="w-full border-sky-200 shadow-sm">
            <PanelHeader
              icon={
                <SuccessIcon tone={tone} prefersReduced={!!prefersReduced}>
                  {icon}
                </SuccessIcon>
              }
              title={title}
              tone={tone}
            />
            <CardContent className="flex flex-col gap-5">
              <div className="overflow-hidden rounded-lg border bg-white">
                <Table>
                  <TableBody className="text-lg sm:text-xl">
                    {rows.map((row, index) => (
                      <motion.tr
                        key={row.label}
                        data-slot="table-row"
                        className="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted"
                        initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          prefersReduced
                            ? undefined
                            : { duration: 0.3, ease: 'easeOut', delay: 0.15 + index * 0.05 }
                        }
                      >
                        <TableCell className="w-36 bg-muted/40 font-bold text-muted-foreground sm:w-44">
                          {row.label}
                        </TableCell>
                        <TableCell className={cn('font-bold', row.valueClassName)}>
                          {row.value}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {note ? (
                <motion.p
                  className="text-center text-lg font-bold text-foreground"
                  initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    prefersReduced
                      ? undefined
                      : { duration: 0.3, ease: 'easeOut', delay: footerDelay - 0.05 }
                  }
                >
                  {note}
                </motion.p>
              ) : null}
            </CardContent>
            <CardFooter>
              <motion.div
                className="w-full"
                initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  prefersReduced
                    ? undefined
                    : { duration: 0.3, ease: 'easeOut', delay: footerDelay }
                }
              >
                {footer}
              </motion.div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
