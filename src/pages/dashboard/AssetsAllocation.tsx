import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import formatSeconds from "@/utils/formatSeconds";
import { addDays, differenceInSeconds } from "date-fns";
import BreadCrumb from "@/components/breadcrumb";
import { PlusCircle } from "react-feather";
import { Button } from "@/components/ui/button";
import TableTools from "@/components/enterprise/TableTools";
import { EXPORTS } from "@/lib/exportConfigs";
import { AssetAllocationFormModal } from "@/components/modals/AssetAllocationFormModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useEditRow from "@/hooks/use-edit-row";
import useConfirmModal from "@/hooks/useConfirmModal";
import useModalState from "@/hooks/useModalState";
import { toast } from "sonner";
import StatCard from "@/components/StatCard";
import { AlertTriangle, ClipboardList, PackageCheck, RotateCcw } from "lucide-react";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";

export default function AssetsAllocation() {
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
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("name")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "assigned_to",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="assigned to" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("assigned_to")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("type")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "serial_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Serial Number" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("serial_number")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Code" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("code")}</div>
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
        const status = row.getValue("status") as string;
        const tone =
          status === "returned" || status === "in_stock"
            ? "success"
            : status === "lost" || status === "damaged"
            ? "danger"
            : status === "in_transit" || status === "maintenance"
            ? "warning"
            : "info";
        return (
          <Badge variant={tone} className="capitalize">
            {status?.replace("_", " ")}
          </Badge>
        );
      },
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
              title: "Edit allocation",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "delete allocation",
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
      "assets_allocations",
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
      const searchQ = searchText
        ? `name~"${searchText}" || serial_number~"${searchText}" || code~"${searchText}" || type~"${searchText}" || status~"${searchText}" || assigned_to.name~"${searchText}"`
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
        .collection("assets_allocations")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `assigned_to`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                name: e.name,
                type: e.type,
                serial_number: e.serial_number || "N.A",
                code: e.code,
                status: e.status,

                assigned_to: e.expand?.assigned_to?.name,
                duration: formatSeconds(
                  differenceInSeconds(
                    e.returned_at || new Date(),
                    e.assigned_at
                  )
                ),
                assigned_at: new Date(e.assigned_at).toLocaleDateString(
                  "en-US",
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }
                ),
                returned_at: new Date(e.returned_at).toLocaleDateString(
                  "en-US",
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }
                ),
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

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("roles")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Roles deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();
  const newRecordModal = useModalState();

  const statsQuery = useQuery({
    queryKey: ["assets-allocation-stats"],
    queryFn: async () => {
      const [total, assigned, returned, lostOrDamaged] = await Promise.all([
        pocketbase.collection("assets_allocations").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("assets_allocations")
          .getList(1, 1, { filter: `status="assigned"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("assets_allocations")
          .getList(1, 1, { filter: `status="returned"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("assets_allocations")
          .getList(1, 1, { filter: `status="lost" || status="damaged"` })
          .then((e) => e.totalItems),
      ]);
      return { total, assigned, returned, lostOrDamaged };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      {" "}
      <div className="px-4">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Allocations"
            icon={ClipboardList}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All asset allocations"
          />
          <StatCard
            title="Assigned"
            icon={PackageCheck}
            tone="info"
            loading={statsLoading}
            value={statsQuery.data?.assigned}
            description="Currently assigned to employees"
          />
          <StatCard
            title="Returned"
            icon={RotateCcw}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.returned}
            description="Returned to inventory"
          />
          <StatCard
            title="Lost / Damaged"
            icon={AlertTriangle}
            tone="danger"
            loading={statsLoading}
            value={statsQuery.data?.lostOrDamaged}
            description="Needs attention"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Assets Allocation
            </h2>
            <BreadCrumb
              items={[{ title: "Assests allocation", link: "/dashboard" }]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TableTools exportConfig={EXPORTS.assetAllocations()} />
            <Button
              onClick={() => {
                newRecordModal.open();
              }}
              size="sm"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Create new allocation</span>
            </Button>
          </div>
        </div>
        <DataTable
          // className="!border-none !p-0"
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
              title: "Type",
              name: "type",
              options: [
                { value: "laptop", label: "laptop" },
                { value: "phone", label: "phone" },
                { value: "cable", label: "cable" },
              ],
            },
            {
              title: "Status",
              name: "status",
              options: [
                { value: "assigned", label: "assigned" },
                { value: "returned", label: "returned" },
                { value: "lost", label: "lost" },
                {
                  value: "damaged",
                  label: "damaged",
                },
                {
                  value: "in_stock",
                  label: "in stock",
                },
                {
                  value: "in_transit",
                  label: "in transit",
                },
                {
                  value: "maintenance",
                  label: "maintenance",
                },
              ],
            },
            {
              title: "Assigned to",
              loader: ({ search }) => {
                return pocketbase
                  .collection("users")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "assigned_to",
              type: "async-options",
            },
          ]}
        />
      </div>
      <AssetAllocationFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
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
