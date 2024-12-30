import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import React, { useState } from "react";
import { useMutation, useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import formatSeconds from "@/utils/formatSeconds";
import { differenceInSeconds } from "date-fns";
import { RunShiftReportModal } from "./modals/RunShiftReportModal";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/auth.context";
import { PlusCircle } from "react-feather";
import useModalState from "@/hooks/useModalState";
import { NewWorkShiftModal } from "./modals/NewWorkShiftModal";

export default function WorkShifts() {
  const [shiftToShow, setshiftToShow] = React.useState(undefined);

  const params = useParams();

  const workPeriodId = params.workPeriodId;

  const navigate = useNavigate();

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          // @ts-ignore
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },

    {
      accessorKey: "employee",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Waiter" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("employee")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("status")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "duration",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Duration" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("duration")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },

    {
      accessorKey: "started_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Started at" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]- flex items-center gap-2">
          <div className="capitalize">{row.getValue("started_at")}</div>
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "ended_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ended at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("ended_at")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "sales_amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Sales amount" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">
          {Number(row.getValue("sales_amount")).toLocaleString()} FRW
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("created")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actions" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {!row.original.original?.expand?.work_period?.ended_at &&
          row.original.original?.report ? (
            <Button
              size={"sm"}
              onClick={() => {
                navigate(
                  `/dashboard/reports/work-periods/${workPeriodId}/shifts/${row.original.id}`
                );
              }}
              className="text-green-500"
              variant="link"
            >
              Update report
            </Button>
          ) : (
            <Button
              size={"sm"}
              onClick={() => {
                // @ts-ignore
                // setshiftToShow(row.original.original);
                if (!row.original.original?.ended_at) {
                  setshiftToEnd(row.original.original);
                } else if (row.original.original?.report) {
                  navigate(
                    `/dashboard/reports/cashier-reports/${row.original.original?.report}`
                  );
                } else {
                  navigate(
                    `/dashboard/reports/work-periods/${workPeriodId}/shifts/${row.original.id}`
                  );
                }
              }}
              className={
                row.original.original?.ended_at
                  ? "text-blue-500"
                  : "text-red-500"
              }
              variant="link"
            >
              {!row.original.original?.ended_at
                ? "End shift"
                : row.original.original?.report
                ? "View report"
                : "Split payment"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const [shiftToEnd, setshiftToEnd] = useState(undefined);

  const [searchText, setsearchText] = useState("");

  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([
    {
      id: "created",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "work_shifts",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        workPeriodId,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText
        ? `employee.name~"${searchText}" || employee.name~"${searchText}"`
        : "";
      const filters = columnFilters
        .map((e) => {
          return e.value.map((p) => `${e.id}="${p}"`).join(" || ");
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("work_shifts")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `work_period="${workPeriodId}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: `employee,ended_by,work_period`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e.expand?.employee?.name,
                ended_by: e.expand?.ended_by?.name,
                sales_amount: e?.custom_gross_amount || 0,
                started_at: new Date(e.started_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                status: e.status || "open",
                ended_at: e.ended_at
                  ? new Date(e.ended_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "---",
                duration:
                  formatSeconds(
                    differenceInSeconds(
                      e.ended_at ? new Date(e.ended_at) : new Date(),
                      new Date(e.started_at)
                    )
                  ) || "---",
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                updated: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                original: e,
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  const { user } = useAuth();

  const clockOutMutation = useMutation({
    mutationFn: ({ closing_notes }: any) => {
      return pocketbase.collection("work_shifts").update(shiftToEnd.id, {
        ended_by: user.id,
        ended_at: new Date(),
        closing_notes,
      });
    },
    onSuccess: () => {
      toast.success("You have successfully clocked out");
      recordsQuery.refetch();
      setshiftToEnd(undefined);
    },
    onError: (error) => {
      toast.error("An error occurred while clocking in");
      console.log(error);
    },
  });

  const newWorkShiftModal = useModalState();

  return (
    <>
      <DataTable
        Action={() => (
          <Button
            size="sm"
            className="mr-3"
            onClick={() => newWorkShiftModal.open()}
          >
            <PlusCircle size={15} className="text-white mr-2" />
            New custom shift
          </Button>
        )}
        className="border-none"
        isFetching={recordsQuery.isFetching}
        defaultColumnVisibility={{
          created_by: false,
          approved_by: false,
          rejected_by: false,
          updated: false,
        }}
        isLoading={recordsQuery.status === "loading"}
        data={recordsQuery?.data?.items || []}
        columns={columns}
        onSearch={(e) => {
          setsearchText(e);
        }}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={recordsQuery?.data?.totalPages}
        setPagination={setPagination}
        pageIndex={pageIndex}
        pageSize={pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        facets={[]}
      />
      <NewWorkShiftModal
        open={newWorkShiftModal.isOpen}
        setOpen={newWorkShiftModal.setisOpen}
        onComplete={() => {
          recordsQuery.refetch();
          newWorkShiftModal.setisOpen(false);
        }}
      />
      <RunShiftReportModal
        open={Boolean(shiftToShow) || Boolean(shiftToEnd)}
        setOpen={(e) => {
          if (!e) {
            setshiftToShow(undefined);
            setshiftToEnd(undefined);
          }
        }}
        readOnly={shiftToEnd ? false : shiftToShow?.ended_at}
        shift={shiftToShow || shiftToEnd}
        isClockingOut={clockOutMutation.isLoading}
        clockOut={(e) => clockOutMutation.mutateAsync(e)}
      />
    </>
  );
}
