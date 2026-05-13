import { Card } from '@tecnova/ui/components/card';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tecnova/ui/components/table';
import { cn } from '@tecnova/ui/lib/utils';

interface Props {
  columns: number;
  rows?: number;
  className?: string;
}

// 一覧ページのローディング表示。最終的な表の形に近づけて、表示直後のレイアウト
// シフトを抑えるのが狙い。columns に列数、rows に行数を渡す。
export function TableSkeleton({ columns, rows = 6, className }: Props) {
  const headIndices = Array.from({ length: columns }, (_, i) => i);
  const rowIndices = Array.from({ length: rows }, (_, i) => i);
  return (
    <Card className={cn('p-0', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {headIndices.map((i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowIndices.map((r) => (
            <TableRow key={r}>
              {headIndices.map((c) => (
                <TableCell key={c}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
