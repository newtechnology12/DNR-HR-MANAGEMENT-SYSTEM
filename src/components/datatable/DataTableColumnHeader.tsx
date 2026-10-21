import { ArrowDownIcon, ArrowUpIcon, CaretSortIcon } from "@radix-ui/react-icons";
import { Column } from "@tanstack/react-table";
import { cn } from "@/utils";
interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  // Same as the ims DataTable: click to sort (largest / newest first), click again to reverse.
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "desc" ? false : true)}
      className={cn("inline-flex items-center gap-1 rounded-sm text-[12.5px] font-semibold text-ims-muted hover:text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus", sorted && "text-ims-text", className)}
      aria-label={`Sort by ${title}`}
    >
      <span className="truncate">{title}</span>
      {sorted === "desc" ? <ArrowDownIcon className="h-3.5 w-3.5" /> : sorted === "asc" ? <ArrowUpIcon className="h-3.5 w-3.5" /> : <CaretSortIcon className="h-3.5 w-3.5 text-ims-faint" />}
    </button>
  );
}

export default DataTableColumnHeader;
