import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useOutletContext } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useMutation, useQuery } from "react-query";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import useConfirmModal from "@/hooks/useConfirmModal";
import { addDays } from "date-fns";
import ConfirmModal from "./modals/ConfirmModal";
import { useAuth } from "@/context/auth.context";

export default function WorkPeriodTransactions() {
  const [_, workPeriodId] = useOutletContext() as [any, any];

  console.log(workPeriodId);

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
      accessorKey: "time",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Time" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]- flex items-center gap-2">
          <Link
            to={""}
            className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
          >
            {row.getValue("time")}
          </Link>
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },

    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("amount")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "payment_method",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Payment method" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("payment_method")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },

    {
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("created_by")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "approved_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Approved by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("approved_by")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "order",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order" />
      ),
      cell: ({ row }) => (
        <Link
          to={""}
          className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
        >
          #{row.getValue("order")}
        </Link>
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
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("status")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "customer",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Customer" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("customer")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "created",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("created")}</div>
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
              disabled: row.getValue("status") === "approved",
              title: "approve transaction",
              onClick: (e) => {
                confirmModal.open({ meta: e });
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
      "transactions",
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
        ? `payment_method.name~"${searchText}" || order.code~"${searchText}" || amount~"${searchText}" || created_by.name~"${searchText}"`
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
        .collection("transactions")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `order.work_period="${workPeriodId}"`]
              .filter((e) => e)
              .join("&&"),
            expand:
              "customer,supplier,staff,created_by,payment_method,order,approved_by,customer",
            sort: sorters,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                time: new Date(e.created).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                payment_method: e.expand?.payment_method?.name || "N.A",
                order: e?.expand?.order?.code || "N.A",
                bill_to: e.bill_to,
                created_by: e?.expand?.created_by?.name,
                customer: e?.expand?.customer?.name || "N.A",
                approved_by: e?.expand?.approved_by?.name || "N.A",
                amount: Number(e?.amount).toLocaleString() + " RWF",
                status: e.status || "N.A",
                created: new Date(e.created).toLocaleDateString("en-US", {
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

  const confirmModal = useConfirmModal();

  const { user } = useAuth();

  const approveTransaction = async (e) => {
    return pocketbase.collection("transactions").update(e.id, {
      status: "approved",
      approved_by: user?.id,
    });
  };

  const approveTransactionMutation = useMutation({
    mutationFn: (e) => {
      return approveTransaction(e);
    },
    onSuccess: () => {
      recordsQuery.refetch();
      confirmModal.close();
    },
  });

  return (
    <>
      <DataTable
        className="border-none"
        isFetching={recordsQuery.isFetching}
        defaultColumnVisibility={{ approved_by: false, customer: false }}
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
            title: "Payment method",
            loader: () => {
              return pocketbase
                .collection("payment_methods")
                .getFullList()
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            type: "async-options",
            name: "payment_method",
          },
          {
            title: "Created by",
            loader: () => {
              return pocketbase
                .collection("users")
                .getFullList({
                  //   filter: `role="${"waiter"}"`,
                })
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            name: "created_by",
            type: "async-options",
          },
          {
            title: "Status",
            options: [
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
              { label: "Pending", value: "pending" },
            ],
            name: "status",
          },
        ]}
      />
      <ConfirmModal
        title={"Are you sure you want to approve?"}
        description={`You are about to approve this transaction. This action is irreversible.`}
        meta={confirmModal.meta}
        onConfirm={(e) => approveTransactionMutation.mutate(e)}
        isLoading={approveTransactionMutation.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
