import * as React from "react";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { differenceInSeconds } from "date-fns";
import formatSeconds from "@/utils/formatSeconds";
import { cn } from "@/utils";
import { RunShiftReportModal } from "./modals/RunShiftReportModal";
import Loader from "./icons/Loader";

export type Payment = {
  id: string;
  amount: number;
  status: "pending" | "processing" | "success" | "failed";
  email: string;
};

export function ShiftsHistory() {
  const columns: ColumnDef<Payment>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("date")}</div>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => (
        <div className="lowercase">{row.getValue("duration")}</div>
      ),
    },
    {
      accessorKey: "started",
      header: "Started",
      cell: ({ row }) => (
        <div className="lowercase">{row.getValue("started")}</div>
      ),
    },
    {
      accessorKey: "ended",
      header: "Ended",
      cell: ({ row }) => (
        <div className="lowercase">{row.getValue("ended")}</div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      enableHiding: false,
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <DotsHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  // @ts-ignore
                  setshiftToShow(row.original.original);
                }}
              >
                View shift report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const [{ pageIndex, pageSize }, setPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: 5,
    });

  const { user } = useAuth();

  const recordsQuery: any = useQuery({
    queryKey: [
      "my_shifts",
      {
        pageIndex,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      return pocketbase
        .autoCancellation(false)
        .collection("work_shifts")
        .getList(pageIndex + 1, pageSize, {
          filter: `employee="${user.id}"`,
          sort: "-created",
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                date: new Date(e.created).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
                started: new Date(e.started_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                ended: e.ended_at
                  ? new Date(e.ended_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "---",
                shift: e?.expand?.shift?.name || "night shift",
                duration: formatSeconds(
                  differenceInSeconds(e.ended_at || new Date(), e.started_at)
                ),
                original: e,
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  //   console.log(recordsQuery.dat);

  const table = useReactTable({
    data: recordsQuery?.data?.items || [],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    pageCount: recordsQuery?.data?.totalPages,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: { pageIndex, pageSize },
    },
  });

  const [shiftToShow, setshiftToShow] = React.useState(undefined);

  return (
    <>
      <RunShiftReportModal
        open={Boolean(shiftToShow)}
        setOpen={(e) => {
          if (!e) {
            setshiftToShow(undefined);
          }
        }}
        readOnly
        shift={shiftToShow}
      />
      <div className="px-1 py-1">
        <div className="w-full pt-3 px-3 rounded-[4px] border bg-white">
          <div className="rounded-[4px] border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header, i, arr) => {
                      return (
                        <TableHead
                          className={cn({
                            "!text-right": i === arr.length - 1,
                          })}
                          key={header.id}
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
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell, i, arr) => (
                        <TableCell
                          className={cn({
                            "!text-right !flex justify-end":
                              i === arr.length - 1,
                          })}
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
                  <TableRow>
                    {recordsQuery.status === "loading" ? (
                      <TableCell
                        colSpan={columns.length}
                        className="h-28 text-center"
                      >
                        <div className="w-full flex items-center justify-center ">
                          <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
                        </div>
                      </TableCell>
                    ) : (
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No results.
                      </TableCell>
                    )}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end space-x-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s) selected.
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
