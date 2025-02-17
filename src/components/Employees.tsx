import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { PlusCircle } from "lucide-react";
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

export const orderSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  department: z.string(),
  branch: z.string(),
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
        <div className="w-[80px]- flex items-center gap-2">
          <Avatar
            className={"h-5 w-5 !text-[10px]"}
            textClass={"!text-[8px]"}
            path=""
            name={row.getValue("name")}
          />
          <Link
            to={""}
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
        <div className="capitalize- truncate">{row.getValue("email")}</div>
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
        <div className="capitalize truncate tracking-wider-">
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
      accessorKey: "branch",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Branch" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("branch") || "N.A"}
        </div>
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
        return (
          <div
            className={cn(
              "flex w-[110px] text-left justify-center- text-[13px] capitalize rounded-full"
            )}
          >
            <span>{row.getValue("status")}</span>
          </div>
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
            expand: "department,role,branch",
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
                branch: e.expand?.branch?.name || "---",
                status: e.status,
                joined_at: e.joined_at
                  ? new Date(e.joined_at).toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : "N.A",
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

  return (
    <>
      <div className=" bg-white scroller border-t border-l border-r rounded-t">
        <ScrollArea className="w-full  whitespace-nowrap">
          <div className="flex px-2 items-center  justify-start">
            {[
              { title: "Actice employees", name: "Active" },
              { title: "Inactive employees", name: "Inactive" },
            ].map((e, i) => {
              return (
                <a
                  key={i}
                  className={cn(
                    "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
                    {
                      "text-primary ": activeTab === e.name,
                    }
                  )}
                  onClick={() => {
                    setactiveTab(e.name);
                  }}
                >
                  {activeTab === e.name && (
                    <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                  )}
                  <span className=""> {e.title}</span>
                </a>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      <DataTable
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
            <Button
              onClick={() => newEmployeeModal.open()}
              size="sm"
              className="mr-3"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Create new Employee</span>
            </Button>
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
            title: "Branch",
            loader: ({ search }) => {
              return pocketbase
                .collection("branches")
                .getFullList(
                  cleanObject({
                    filter: search ? `name~"${search}"` : "",
                  })
                )
                .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
            },
            name: "branch",
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
