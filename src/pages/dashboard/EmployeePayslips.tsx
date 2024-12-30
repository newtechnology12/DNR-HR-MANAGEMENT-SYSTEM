import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import { addDays } from "date-fns";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";

export default function EmployeePayslips({ employeeId }) {
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
      accessorKey: "payroll",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Payroll" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("payroll")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "payroll_cycle",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Payroll Cycle" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("payroll_cycle")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },

    // {
    //   accessorKey: "net_salary",
    //   header: ({ column }) => (
    //     <DataTableColumnHeader column={column} title="Net Salary" />
    //   ),
    //   cell: ({ row }) => (
    //     <div className="capitalize">
    //       {row.getValue("net_salary").toLocaleString()} FRW
    //     </div>
    //   ),
    //   filterFn: (__, _, value) => {
    //     return value;
    //   },
    //   enableSorting: true,
    //   enableHiding: true,
    // },
    {
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("created_by")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "prepayments",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Prepayments" />
      ),
      cell: ({ row }) => (
        <div>{Number(row.getValue("prepayments")).toLocaleString()} FRW</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "net_salary",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Net salary" />
      ),
      cell: ({ row }) => (
        <div>{Number(row.getValue("net_salary")).toLocaleString()} FRW</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "gross_salary",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Gross salary" />
      ),
      cell: ({ row }) => (
        <div>{Number(row.getValue("gross_salary")).toLocaleString()} FRW</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
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
        <DataTableRowActions
          actions={[
            {
              title: "Download Payslip",
              onClick: (e) => {
                console.log("Download Slip");
              },
            },
          ]}
          row={row}
        />
      ),
    },
  ];

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
      "employees_payrolls",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        employeeId,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText
        ? `payroll.month~"${searchText}" || payroll.year~"${searchText}" || payroll.period_cycle~"${searchText}"`
        : "";
      const filters = columnFilters
        .map((e) => {
          if (e.value["from"]) {
            if (e.value?.to) {
              return `created >= "${new Date(
                e.value?.from
              ).toISOString()}" && created <= "${new Date(
                e.value?.to
              ).toISOString()}"`;
            } else {
              return `created >= "${new Date(
                e.value?.from
              ).toISOString()}" && created <= "${new Date(
                addDays(new Date(e.value?.from), 1)
              ).toISOString()}"`;
            }
          } else {
            return e.value
              .map((p) => `${e.id}="${p.id || p.value || p}"`)
              .join(" || ");
          }
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("employees_payrolls")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `employee="${employeeId}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: `created_by,payroll,payroll.created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                payroll: "1 - 29 Feb 2024",
                payroll_cycle: e.expand?.payroll?.period_cycle,
                net_salary: e.net_sallary || 0,
                gross_salary: e.gross_salary || 0,
                prepayments: e.prepayments || 0,
                created_by: e.expand?.payroll?.expand?.created_by?.name,
                deductions_amount: e?.deductions_amount || 0,
                net_sallary: e?.recieved || 0,
                date: new Date(e.created)?.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
                created: new Date(e.created)?.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  return (
    <>
      <DataTable
        className="!p-0 !border-none"
        isFetching={recordsQuery.isFetching}
        defaultColumnVisibility={{}}
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
        facets={[
          {
            title: "Date",
            type: "date",
            name: "created",
          },
        ]}
      />
    </>
  );
}
