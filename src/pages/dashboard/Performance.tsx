import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import TableTools from "@/components/enterprise/TableTools";
import { EXPORTS } from "@/lib/exportConfigs";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import BreadCrumb from "@/components/breadcrumb";
import { addDays } from "date-fns";
import StatCard from "@/components/StatCard";
import { ClipboardCheck, TrendingUp, Users } from "lucide-react";

export default function Performance() {
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
      accessorKey: "period",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => navigate(`/dashboard/hr/performance/${row.original.id}`)}
          className="capitalize hover:text-primary hover:underline"
        >
          {row.getValue("period")}
        </button>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "employee",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employee" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]- flex items-center gap-2">
          <Link
            to={""}
            className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
          >
            {row.getValue("employee")}
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
      accessorKey: "score",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="score" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("score")}/100</div>
      ),
      enableSorting: true,
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
      enableHiding: true,
      filterFn: (__, _, value) => {
        return value;
      },
    },

    {
      accessorKey: "updated",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Updated at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("updated")}</div>
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
              title: "Edit perfomance",
              onClick: (e) => {
                navigate(`/dashboard/hr/performance/${e.id}`);
              },
            },
            {
              title: "delete perfomance",
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
      "perfomance_evaluations",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `name~"${searchText}"` : "";
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
        .collection("perfomance_evaluations")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `employee,created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                score: e.score,
                employee: e.expand?.employee?.name || 0,
                created_by: e.expand?.created_by?.name || "N.A",
                period: e.period_year + "-" + e.period_month,
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                updated: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
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

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("perfomance_evaluations")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Performance evaluation deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const navigate = useNavigate();

  const statsQuery = useQuery({
    queryKey: ["performance-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString();

      const [total, thisMonth, all] = await Promise.all([
        pocketbase.collection("perfomance_evaluations").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("perfomance_evaluations")
          .getList(1, 1, { filter: `created >= "${startOfMonth}"` })
          .then((e) => e.totalItems),
        pocketbase.collection("perfomance_evaluations").getFullList({ fields: "employee" }),
      ]);
      const employeesEvaluated = new Set(all.map((e: any) => e.employee).filter(Boolean)).size;
      return { total, thisMonth, employeesEvaluated };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      <div className="px-4">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Evaluations"
            icon={ClipboardCheck}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All performance evaluations"
          />
          <StatCard
            title="This Month"
            icon={TrendingUp}
            tone="info"
            loading={statsLoading}
            value={statsQuery.data?.thisMonth}
            description="Evaluations created this month"
          />
          <StatCard
            title="Employees Evaluated"
            icon={Users}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.employeesEvaluated}
            description="Unique employees reviewed"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Perfomance & Appraisals
            </h2>
            <BreadCrumb
              items={[
                { title: "View Perfomance & Appraisals", link: "/dashboard" },
              ]}
            />
          </div>
          <Button
            onClick={() => {
              navigate("/dashboard/hr/performance/new");
            }}
            size="sm"
          >
            <PlusCircle size={16} className="mr-2" />
            <span>New evaluation</span>
          </Button>
          <TableTools exportConfig={EXPORTS.appraisals()} />
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
              title: "Employee",
              loader: ({ search }) => {
                console.log(search);
                return pocketbase
                  .collection("users")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "employee",
              type: "async-options",
            },
            {
              title: "Created by",
              loader: ({ search }) => {
                console.log(search);
                return pocketbase
                  .collection("users")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "created_by",
              type: "async-options",
            },
          ]}
        />
      </div>

      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={"This action cannot be undone. This will permanently delete the selected record."}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
