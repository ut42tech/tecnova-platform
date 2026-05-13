import { cn } from '@tecnova/ui/lib/utils';

interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

// 各ページ共通のヘッダ。title / description / actions の3スロット構成。
// PC 前提だが actions が増えたときは折り返すように flex-wrap を入れている。
export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <section
      className={cn('flex flex-wrap items-start justify-between gap-4 border-b pb-4', className)}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}
