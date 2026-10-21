import DataTable from "@/components/DataTable";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import BreadCrumb from "@/components/breadcrumb";
import { DepartmentFormModal } from "@/components/modals/DepartmentFormModal";
import StatCard from "@/components/StatCard";
import { Briefcase, Building2, UserCog, Users } from "lucide-react";

export default function Departments() {
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
        <button
          type="button"
          onClick={() => editRow.edit(row.original)}
          className="capitalize hover:text-primary hover:underline"
        >
          {row.getValue("name")}
        </button>
      ),
      enableSorting: true,
      enableHiding: true,
    },

    {
      accessorKey: "manager",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Manager" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("manager") || "N.A"}</div>
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
        <DataTableRowActions
          actions={[
            {
              title: "Edit department",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "delete department",
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
      "departments",
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
          return e.value.map((p) => `${e.id}="${p}"`).join(" || ");
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("departments")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `departments,created_by,head`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                name: e.name,
                manager: e.expand?.head?.name,
                created: new Date(e.created).toLocaleDateString("en-US", {
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

  const statsQuery = useQuery({
    queryKey: ["departments-stats"],
    queryFn: async () => {
      const [total, employees, designations, withManager] = await Promise.all([
        pocketbase.collection("departments").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("users").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("designations").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("departments")
          .getList(1, 1, { filter: `head != ""` })
          .then((e) => e.totalItems),
      ]);
      return { total, employees, designations, withManager };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("departments")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Department deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  return (
    <>
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Departments"
            icon={Building2}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="Departments in the company"
          />
          <StatCard
            title="Total Employees"
            icon={Users}
            tone="info"
            loading={statsLoading}
            value={statsQuery.data?.employees}
            description="Employees across all departments"
          />
          <StatCard
            title="Designations"
            icon={Briefcase}
            tone="warning"
            loading={statsLoading}
            value={statsQuery.data?.designations}
            description="Job designations defined"
          />
          <StatCard
            title="With Manager"
            icon={UserCog}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.withManager}
            description="Departments with a manager assigned"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              All Departments
            </h2>
            <BreadCrumb
              items={[{ title: "View Departments", link: "/dashboard" }]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TableTools
              importConfig={IMPORTS.departments}
              onImported={() => recordsQuery.refetch()}
              exportConfig={{
                title: "Departments", fileName: "departments", what: "departments", permission: ["view_departments", "create_department"],
                rows: () => pocketbase.collection("departments").getFullList({ sort: "name", expand: "head" }),
                columns: [
                  { header: "Name", value: (r: any) => r.name, width: 34 },
                  { header: "Code", value: (r: any) => r.code || "" },
                  { header: "Head of department", value: (r: any) => r.expand?.head?.name || "" },
                  { header: "Description", value: (r: any) => r.description || "", width: 40 },
                ],
              }}
            />
            <Button onClick={() => newRecordModal.open()} size="sm">
              <PlusCircle size={16} />
              <span>Create Department</span>
            </Button>
          </div>
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
          ]}
        />
      </div>

      <DepartmentFormModal
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
        title={"Delete this department?"}
        description={
          "This will permanently remove the department. Employees assigned to it will keep their record but lose this department reference. This action cannot be undone."
        }
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
