import displayDate from "@/utils/displayDate";
import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { FileSpreadsheet, PlusCircle } from "lucide-react";
import { cn } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import { addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/shared/Avatar";
import useModalState from "@/hooks/useModalState";
import { EmployeeFormModal } from "@/components/modals/EmployeeFormModal";
import useEditRow from "@/hooks/use-edit-row";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import formatFilter from "@/utils/formatFilter";
import { Badge } from "@/components/ui/badge";
import StatCard from "@/components/StatCard";
import { Building2, UserCheck, UserPlus, UserX, Users } from "lucide-react";

export const orderSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  department: z.string(),
});

export type Order = z.infer<typeof orderSchema>;

export default function Employees({ ...otherProps }) {
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
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar
            className={"h-6 w-6 !text-[10px]"}
            textClass={"!text-[8px]"}
            path={
              (row.original as any).avatar
                ? pocketbase.files.getUrl(
                    (row.original as any).original,
                    (row.original as any).avatar
                  )
                : ""
            }
            name={row.getValue("name")}
          />
          <Link
            to={`/dashboard/hr/employees/${row.original.id}`}
            className="hover:underline flex truncate items-center gap-2 capitalize hover:text-slate-600"
          >
            {row.getValue("name")}
          </Link>
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },

    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email" />
      ),
      cell: ({ row }) => (
        <div className="truncate">{row.getValue("email")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("role")}</div>
      ),
      enableSorting: false,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },

    {
      accessorKey: "department",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("department") || "N.A"}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "phone",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Phone" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("phone")}</div>
      ),
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
        return (
          <Badge variant={status === "Active" ? "success" : "secondary"} className="capitalize">
            {status}
          </Badge>
        );
      },
      filterFn: (__, _, value) => {
        return value;
      },
    },
    {
      accessorKey: "joined_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Joined at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("joined_at")}</div>
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
              title: "view employee profile",
              onClick: (e) => {
                navigate(`/dashboard/hr/employees/${e.id}`);
              },
            },
            {
              title: "update employee",
              onClick: (e) => {
                editRow.edit(e?.original);
              },
            },
          ]}
          row={row}
        />
      ),
    },
  ];

  const [searchText, setsearchText] = useState("");

  const [columnFilters, setColumnFilters] = useState<any>([]);

  const [sorting, setSorting] = useState<any>([
    {
      id: "created",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const [activeTab, setactiveTab] = useState("Active");

  const employeesQuery = useQuery({
    queryKey: [
      "employees",
      {
        search: searchText,
        filter: columnFilters,
        sort: sorting,
        pageIndex,
        pageSize,
        activeTab,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText
        ? `name~"${searchText}" || department.name~"${searchText}" `
        : "";

      const filters = formatFilter(columnFilters);

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("users")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`]
              .filter((e) => e)
              .join("&&"),
            expand: "department,role",
            sort: sorters,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                name: e.name,
                avatar: e.avatar,
                role: e.expand?.role?.name || "---",
                email: e.email || "---",
                phone: e.phone,
                department: e.expand?.department?.name || "---",
                status: e.status,
                joined_at: displayDate(e.joined_at),
                original: e,
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  const newEmployeeModal = useModalState();

  const editRow = useEditRow();

  const statsQuery = useQuery({
    queryKey: ["employees-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString();

      const [total, active, inactive, departments, newHires] = await Promise.all([
        pocketbase.collection("users").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("users")
          .getList(1, 1, { filter: `status="Active"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("users")
          .getList(1, 1, { filter: `status="Inactive"` })
          .then((e) => e.totalItems),
        pocketbase.collection("departments").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("users")
          .getList(1, 1, { filter: `joined_at >= "${startOfMonth}"` })
          .then((e) => e.totalItems),
      ]);

      return { total, active, inactive, departments, newHires };
    },
    enabled: true,
  });

  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Employees"
          icon={Users}
          tone="default"
          loading={statsLoading}
          value={statsQuery.data?.total}
          description="All employees on record"
        />
        <StatCard
          title="Active"
          icon={UserCheck}
          tone="success"
          loading={statsLoading}
          value={statsQuery.data?.active}
          description="Currently active employees"
        />
        <StatCard
          title="Inactive"
          icon={UserX}
          tone="danger"
          loading={statsLoading}
          value={statsQuery.data?.inactive}
          description="Currently inactive employees"
        />
        <StatCard
          title="Departments"
          icon={Building2}
          tone="info"
          loading={statsLoading}
          value={statsQuery.data?.departments}
          description="Departments in the company"
        />
        <StatCard
          title="New Hires"
          icon={UserPlus}
          tone="warning"
          loading={statsLoading}
          value={statsQuery.data?.newHires}
          description="Joined this month"
        />
      </div>

      <div className="rounded-t-card border-l border-r border-t border-slate-200 bg-white">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex items-center justify-start px-2">
            {[
              { title: "Active employees", name: "Active" },
              { title: "Inactive employees", name: "Inactive" },
            ].map((e, i) => {
              return (
                <button
                  type="button"
                  key={i}
                  className={cn(
                    "relative cursor-pointer px-6 py-3 text-center text-[13px] font-medium capitalize text-slate-500 sm:text-sm",
                    {
                      "text-primary": activeTab === e.name,
                    }
                  )}
                  onClick={() => {
                    setactiveTab(e.name);
                  }}
                >
                  {activeTab === e.name && (
                    <div className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-md bg-primary" />
                  )}
                  <span>{e.title}</span>
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      <DataTable
        className="rounded-t-none"
        isFetching={employeesQuery.isFetching}
        defaultColumnVisibility={{}}
        isLoading={employeesQuery.status === "loading"}
        data={employeesQuery?.data?.items || []}
        columns={columns}
        onSearch={(e) => {
          setsearchText(e);
        }}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={employeesQuery?.data?.totalPages}
        setPagination={setPagination}
        pageIndex={pageIndex}
        pageSize={pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        Action={() => {
          return (
            <div className="mr-3 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/hr/employees/import")}>
                <FileSpreadsheet size={15} className="mr-1.5" />
                <span>Import from Excel</span>
              </Button>
              <Button onClick={() => newEmployeeModal.open()} size="sm">
                <PlusCircle size={16} className="mr-2" />
                <span>Create new Employee</span>
              </Button>
            </div>
          );
        }}
        facets={[
          {
            title: "Role",
            loader: ({ search }) => {
              return pocketbase
                .collection("roles")
                .getFullList(
                  cleanObject({
                    filter: search ? `name~"${search}"` : "",
                  })
                )
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            name: "role",
            type: "async-options",
          },
          {
            title: "Department",
            loader: ({ search }) => {
              return pocketbase
                .collection("departments")
                .getFullList(
                  cleanObject({
                    filter: search ? `name~"${search}"` : "",
                  })
                )
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            name: "department",
            type: "async-options",
          },
        ]}
        {...otherProps}
      />

      <EmployeeFormModal
        onComplete={() => {
          employeesQuery.refetch();
          newEmployeeModal.close();
          editRow.close();
        }}
        employee={editRow.row}
        employeeToUpdate={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newEmployeeModal.setisOpen}
        open={newEmployeeModal.isOpen || editRow.isOpen}
      />
    </>
  );
}
