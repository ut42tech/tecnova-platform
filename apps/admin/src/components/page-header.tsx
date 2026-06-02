import { cn } from '@tecnova/ui/lib/utils';

interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

// 各ページ共通のヘッダ。title / description / actions の3スロット構成。
// モバイルでは縦積み、sm 以上でタイトルと actions を左右に並べる。
export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}
