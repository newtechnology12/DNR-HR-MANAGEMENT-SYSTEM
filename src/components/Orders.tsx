import DataTable from "./DataTable";

import { ColumnDef, PaginationState } from "@tanstack/react-table";

import DataTableColumnHeader from "./datatable/DataTableColumnHeader";
import { Checkbox } from "./ui/checkbox";
import formatOrder from "@/utils/formatOrder";
import { z } from "zod";
import { ArrowRightCircle, Check, CheckIcon, XIcon } from "lucide-react";
import { GitPullRequest } from "react-feather";
import { cn } from "@/utils";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useQuery } from "react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { addDays } from "date-fns";
import { Button } from "./ui/button";

// We're keeping a simple non-relational schema here.
// IRL, you will have a schema for your data models.
export const orderSchema = z.object({
  id: z.string(),
  code: z.string(),
  table: z.string(),
  items_count: z.number(),
  total: z.number(),
  status: z.string(),
  payment_status: z.string(),
  guests: z.number(),
  customer: z.string(),
});

export type Order = z.infer<typeof orderSchema>;

const statuses = [
  {
    value: "draft",
    label: "draft",
    icon: GitPullRequest,
  },
  {
    value: "on going",
    label: "on going",
    icon: ArrowRightCircle,
  },
  {
    value: "completed",
    label: "completed",
    icon: CheckIcon,
  },
  {
    value: "canceled",
    label: "canceled",
    icon: XIcon,
  },
];

const payment_statuses = [
  {
    value: "pending",
    label: "pending",
    icon: GitPullRequest,
  },
  {
    value: "paid",
    label: "paid",
    icon: Check,
  },
  {
    value: "failed",
    label: "failed",
    icon: XIcon,
  },
];

export default function Orders({ ...other }) {
  const navigate = useNavigate();
  const columns: ColumnDef<Order>[] = [
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
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Code" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]">
          <Link to={""} className="hover:underline hover:text-slate-600">
            {row.getValue("code")}
          </Link>
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },

    {
      accessorKey: "total",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]">
          {row.getValue("total").toLocaleString()} FRW
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },

    {
      accessorKey: "table",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Table" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px] capitalize">{row.getValue("table")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "total_paid",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total paid" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px] capitalize">{row.getValue("total_paid")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = statuses.find(
          (status) => status.value === row.getValue("status")
        );

        if (!status) {
          return null;
        }

        return (
          <div
            className={cn(
              "flex w-[110px] text-left justify-center- text-[13px] capitalize rounded-full",
              {
                "text-yellow-500": status.value === "on going",
                "text-green-500": status.value === "completed",
                "text-gray-500": status.value === "draft",
                "text-red-500": status.value === "canceled",
              }
            )}
          >
            {status.icon && (
              <div>
                <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <span>{status.label}</span>
          </div>
        );
      },
      filterFn: (__, _, value) => {
        return value;
      },
    },
    {
      accessorKey: "guests",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Guests" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]">{row.getValue("guests")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },

    {
      accessorKey: "waiter",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Waiter" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]">
          <Link to={""} className="hover:underline hover:text-slate-600">
            {row.getValue("waiter") as any}
          </Link>
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "items_count",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Items" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]">{row.getValue("items_count")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "customer",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Customer" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]-">{row.getValue("customer") as any}</div>
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
        <DataTableColumnHeader column={column} title="Ordered at" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]">
          <span className="truncate">{row.getValue("created") as any}</span>
        </div>
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
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => (
        <Button
          size={"sm"}
          onClick={() => {
            navigate(`/dashboard/sales/orders/${row.original.id}`);
          }}
          className="text-blue-500"
          variant="link"
        >
          View Details
        </Button>
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

  const ordersQuery = useQuery({
    queryKey: [
      "recent-orders",
      {
        search: searchText,
        filter: columnFilters,
        sort: sorting,
        pageIndex,
        pageSize,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `code~"${searchText}"` : "";
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
            return e.value.map((p) => `${e.id}="${p.value || p}"`).join(" || ");
          }
        })
        .join(" && ");
      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("orders")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            expand: "table,items,customer,waiter,bills,bills.transactions",
            sort: sorters,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              const total = formatOrder({ items: e.expand?.items || [] }).total;
              const total_paid = e?.expand?.bills?.reduce(
                (acc, bill) =>
                  acc +
                  bill?.expand?.transactions?.reduce(
                    (acc, transaction) => acc + transaction.amount,
                    0
                  ),
                0
              );
              // get payment_status and get pending, paid, paid partially
              const payment_status =
                total_paid === total
                  ? "paid"
                  : total_paid > 0
                  ? "partially paid"
                  : "pending";
              return {
                id: e.id,
                code: e.code.toString(),
                table: e?.expand?.table?.code || "N.A",
                items_count: e.expand?.items?.length || 0,
                status: e?.status,
                payment_status,
                total_paid: (total_paid || 0)?.toLocaleString() + " FRW",
                guests: e.guests,
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                customer: e?.expand?.customer?.names || "N.A",
                total: total,
                waiter: e?.expand?.waiter?.name,
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  return (
    <div>
      <DataTable
        isFetching={ordersQuery.isFetching}
        defaultColumnVisibility={{
          customer: false,
          guests: false,
          items_count: false,
        }}
        isLoading={ordersQuery.status === "loading"}
        facets={[
          { title: "Status", options: statuses, name: "status" },
          {
            title: "Payment status",
            options: payment_statuses,
            name: "payment_status",
          },
          {
            title: "Table",
            loader: () => {
              return pocketbase
                .collection("tables")
                .getFullList()
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            name: "table",
            type: "async-options",
          },
          {
            title: "Waiter",
            loader: () => {
              return pocketbase
                .collection("users")
                .getFullList()
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            name: "waiter",
            type: "async-options",
          },
          {
            title: "Customer",
            loader: () => {
              return pocketbase
                .collection("customers")
                .getFullList()
                .then((e) => e.map((e) => ({ label: e.names, value: e.id })));
            },
            type: "async-options",
            name: "customer",
          },
          {
            title: "Order Date",
            type: "date",
            name: "created",
          },
        ]}
        data={ordersQuery?.data?.items || []}
        columns={columns}
        onSearch={(e) => {
          setsearchText(e);
        }}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={ordersQuery?.data?.totalPages}
        setPagination={setPagination}
        pageIndex={pageIndex}
        pageSize={pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        {...other}
      />
    </div>
  );
}
