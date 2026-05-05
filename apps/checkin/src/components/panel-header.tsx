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
}: {
  icon: ReactNode;
  title: string;
  tone: PanelTone;
}) {
  return (
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          aria-hidden="true"
          className={`flex size-14 items-center justify-center rounded-full ${panelToneClasses[tone]}`}
        >
          {icon}
        </div>
        <CardTitle className="text-3xl leading-tight">{title}</CardTitle>
      </div>
    </CardHeader>
  );
}
