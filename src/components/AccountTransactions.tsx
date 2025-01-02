import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate, useParams } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useMemo, useState } from "react";
import { useQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import useEditRow from "@/hooks/use-edit-row";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { format } from "date-fns";
import { Input } from "./ui/input";
import { cn } from "@/utils";
import { useRoles } from "@/context/roles.context";
import formatFilter from "@/utils/formatFilter";

export default function AccountTransactions() {
  const navigate = useNavigate();

  const editRow = useEditRow();

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
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => (
        <div
          className={cn("capitalize truncate", {
            "text-green-500": row.getValue("transactionType") === "refill",
          })}
        >
          {row.getValue("date")}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => (
        <div
          className={cn("capitalize truncate", {
            "text-green-500": row.getValue("transactionType") === "refill",
          })}
        >
          {row.getValue("amount")}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "feeAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Fees Amount" />
      ),
      cell: ({ row }) => (
        <div
          className={cn("capitalize truncate", {
            "text-green-500": row.getValue("transactionType") === "refill",
          })}
        >
          {row.getValue("feeAmount")}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "transactionType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Transaction Type" />
      ),
      cell: ({ row }) => (
        <div
          className={cn("capitalize truncate", {
            "text-green-500": row.getValue("transactionType") === "refill",
          })}
        >
          <a
            className="underline cursor-pointer"
            onClick={() => {
              if (row.getValue("transactionType") === "expense") {
                editRow.edit(row?.original?.original?.expand?.expense);
              } else if (row.getValue("transactionType") === "purchase") {
                navigate(
                  `/dashboard/inventory/purchases/${row?.original?.original?.purchase}`
                );
              }
            }}
          >
            {row.getValue("transactionType")}
          </a>
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "balanceAfter",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Balance After" />
      ),
      cell: ({ row }) => (
        <div
          className={cn("capitalize truncate", {
            "text-green-500": row.getValue("transactionType") === "refill",
          })}
        >
          {row.getValue("balanceAfter")}
        </div>
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
        <div
          className={cn("capitalize truncate", {
            "text-green-500": row.getValue("transactionType") === "refill",
          })}
        >
          {row.getValue("created")}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
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
    pageSize: 15,
  });

  const accountId = useParams().accountId;

  const recordsQuery = useQuery({
    queryKey: [
      "accounts",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        accountId,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `name~"${searchText}"` : "";
      const filters = formatFilter(columnFilters);

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("accounts_transactions")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `account="${accountId}"`]
              .filter((e) => e)
              .join("&&"),
            expand: `expense,purchase,expense.account_transaction`,
            sort: sorters,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                date: format(new Date(e.date || new Date()), "dd/MM/yyyy"),
                amount: e.amount.toLocaleString() + " FRW",
                feeAmount: e.feeAmount.toLocaleString() + " FRW",
                transactionType: e.transactionType,
                balanceAfter: e.balanceAfter,
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
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

  const { data: account, refetch } = useQuery({
    queryKey: ["accounts", { accountId }],
    queryFn: () => {
      return pocketbase.collection("accounts").getOne(accountId);
    },
    enabled: !!accountId,
  });

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("accounts_transactions")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("price type deleted succesfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const { canPerform } = useRoles();

  const footer_row = useMemo(() => {
    const out =
      (recordsQuery?.data?.items
        .filter((e) => e?.transactionType !== "refill")
        ?.reduce((acc, e) => {
          return acc + e?.original?.amount;
        }, 0)
        .toLocaleString() || 0) + " FRW";

    const income =
      (recordsQuery?.data?.items
        .filter((e) => e?.transactionType === "refill")
        ?.reduce((acc, e) => {
          return acc + e?.original?.amount;
        }, 0)
        .toLocaleString() || 0) + " FRW";

    const obj = {
      refill: income || 0,
      totalAmount: out || 0,
      feeAmount:
        recordsQuery?.data?.items
          ?.reduce((acc, e) => {
            return acc + e?.original?.feeAmount;
          }, 0)
          .toLocaleString() + " FRW",
      meta: {
        isFooter: true,
      },
    };
    return obj;
  }, [recordsQuery?.data]);

  return (
    <>
      <div className="sm:px-4 px-2">
        <div className="flex items-start justify-between space-y-2 mb-3">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-base font-semibold tracking-tight">
              All Petty Cah account.
            </h2>
            <BreadCrumb
              items={[
                { title: "All accounts transactions", link: "/dashboard" },
              ]}
            />
          </div>
        </div>
        <div className=" grid grid-cols-5 items-center gap-3">
          <Card className="mb-4">
            <CardHeader className="p-3">
              <CardTitle className="text-lg">Current Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-base text-primary font-bold">
                {account?.currentBalance?.toLocaleString()} FRW
              </p>
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader className="p-3">
              <CardTitle className="text-lg">Re-Fill</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-base text-blue-500 font-bold">
                {(footer_row.refill || 0)?.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader className="p-3">
              <CardTitle className="text-lg">Total Used</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-base text-red-500 font-bold">
                {(footer_row.totalAmount || 0)?.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          {canPerform("refill_accounts") && (
            <div className="col-span-2">
              <ReplenishForm
                account={account}
                onReplenish={() => {
                  recordsQuery.refetch();
                  refetch();
                }}
              />
            </div>
          )}
        </div>
        <DataTable
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
              title: "Status",
              name: "status",
              options: [
                { label: "active", value: "active" },
                { label: "inactive", value: "inactive" },
              ],
            },
            {
              title: "Choose Date",
              type: "date",
              name: "date",
            },
          ]}
        />
      </div>

      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
        a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
export function ReplenishForm({ onReplenish, account }: any) {
  const [amount, setAmount] = useState("");
  const [loading, setloading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    setloading;
    e.preventDefault();
    const replenishAmount = parseFloat(amount);
    if (replenishAmount > 0) {
      await pocketbase.collection("accounts_transactions").create({
        amount: replenishAmount,
        date: new Date(),
        account: account?.id,
        transactionType: "refill",
        notes: "",
        feeAmount: 0,
        balanceAfter: account.currentBalance + replenishAmount,
      });

      await pocketbase.collection("accounts").update(account.id, {
        currentBalance: account.currentBalance + replenishAmount,
      });

      onReplenish();
      setAmount("");
    }
  };

  return (
    <Card className="p-3">
      <form onSubmit={handleSubmit} className="space-x-4 flex">
        <div>
          <Input
            id="replenishAmount"
            placeholder="Enter amount"
            type="number"
            step="0.01"
            className="h-9"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            min="0"
          />
        </div>
        <Button disabled={loading} size="sm" type="submit">
          Refill Petty Cash
        </Button>
      </form>
    </Card>
  );
}
