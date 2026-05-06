import { CardHeader, CardTitle } from '@tecnova/ui/components/card';
import type { ReactNode } from 'react';

export type PanelTone = 'emerald' | 'sky' | 'slate' | 'amber';

const panelToneClasses: Record<PanelTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  slate: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-700',
};

export function PanelHeader({
  icon,
  title,
  tone,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  tone: PanelTone;
  trailing?: ReactNode;
}) {
  return (
    <CardHeader className="gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div
            aria-hidden="true"
            className={`flex size-14 items-center justify-center rounded-full ${panelToneClasses[tone]}`}
          >
            {icon}
          </div>
          <CardTitle className="min-w-0 text-3xl leading-tight">{title}</CardTitle>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </CardHeader>
  );
}
