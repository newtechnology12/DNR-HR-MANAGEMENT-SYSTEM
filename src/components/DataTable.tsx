import {
  ColumnDef,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Table as TanTable } from "@tanstack/react-table";

import * as React from "react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from "@radix-ui/react-icons";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "./ui/button";
import { DataTableToolbar } from "./datatable/DataTableToolbar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Inbox } from "lucide-react";
import { cn } from "@/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  facets;
  isLoading;
  defaultColumnVisibility;
  onSearch;
  columnFilters;
  setColumnFilters;
  setSorting;
  sorting;
  setPagination;
  pageIndex;
  pageSize;
  pageCount;
  title?: string;
  isFetching;
  className?: string;
  Action?: any;
  /** What the search box searches, e.g. "Search name or e-mail". */
  searchPlaceholder?: string;
}

function DataTable<TData, TValue>({
  columns,
  data,
  title,
  facets,
  defaultColumnVisibility = {},
  isLoading,
  isFetching,
  onSearch,
  columnFilters,
  setColumnFilters,
  setSorting,
  sorting,
  setPagination,
  pageIndex,
  pageSize,
  pageCount,
  className,
  Action,
  searchPlaceholder,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(defaultColumnVisibility);

  const pagination = React.useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  const table = useReactTable({
    data,
    columns,
    manualSorting: true,
    manualPagination: true,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    enableRowSelection: true,
    pageCount: pageCount,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <Card className={cn("relative h-full overflow-hidden", className)}>
      {isFetching && !isLoading && (
        <div className="progress-bar absolute top-0 h-[3px] w-full overflow-hidden rounded-t-card bg-ims-link/25 opacity-70">
          <div className="progress-bar-value h-full w-full bg-ims-link" />
        </div>
      )}

      {title && (
        <CardHeader className="px-5 pb-0 pt-5">
          <CardTitle className="mb-0">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex h-full flex-col">
          <div className="px-4 py-3.5 sm:px-5">
            <DataTableToolbar
              Action={Action}
              onSearch={onSearch}
              facets={facets}
              table={table}
              searchPlaceholder={searchPlaceholder}
            />
          </div>
          <div className="flex-1 overflow-hidden border-t border-ims-divider">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead
                          className="last:text-right last:justify-end last:flex last:items-center"
                          key={header.id}
                          colSpan={header.colSpan}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {columns.map((_, colIndex) => (
                        <TableCell key={colIndex}>
                          <Skeleton className="h-4 w-full max-w-[160px]" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          className="last:text-right last:justify-end last:flex last:items-center"
                          key={cell.id}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="h-56 text-center">
                      <div className="flex flex-col items-center justify-center gap-3 text-ims-faint">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ims-subtle"><Inbox size={18} /></span>
                        <span className="text-t-body text-ims-muted">Nothing matches. Change the search or clear the filters.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  );
}

export default DataTable;

interface DataTablePaginationProps<TData> {
  table: TanTable<TData>;
}

function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ims-divider px-4 py-3 text-t-small text-ims-muted sm:px-5">
      <div className="tabular-nums">
        Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <p>Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-9 w-[76px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top" className="bg-white">
              {[15, 30, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            className="hidden h-9 w-9 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <DoubleArrowLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 w-9 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 w-9 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-9 w-9 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <DoubleArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
