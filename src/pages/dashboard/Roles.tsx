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
import useModalState from "@/hooks/useModalState";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";

export default function Roles() {
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
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="w-[80px]- flex items-center gap-2">
          <Link
            to={""}
            className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
          >
            {row.getValue("name")}
          </Link>
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "employees",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employees" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("employees")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created By" />
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
        <Button
          size={"sm"}
          onClick={() => {
            navigate(
              `/dashboard/settings/general-settings/roles-permissions/${row.original.id}`
            );
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

  const recordsQuery = useQuery({
    queryKey: [
      "roles",
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
        .collection("roles")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `employees,created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                name: e.name,
                created_by: e.expand?.created_by?.name,
                employees: e.employees.length || 0,
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

  const newRecordModal = useModalState();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("roles")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Roles deleted succesfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  return (
    <>
      <DataTable
        className="!border-none !p-0"
        isFetching={recordsQuery.isFetching}
        defaultColumnVisibility={{}}
        isLoading={recordsQuery.status === "loading"}
        data={recordsQuery?.data?.items || []}
        columns={columns}
        Action={() => {
          return (
            <Button
              className="mr-2"
              onClick={() => {
                navigate(
                  "/dashboard/settings/general-settings/roles-permissions/new"
                );
              }}
              size="sm"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Create new role</span>
            </Button>
          );
        }}
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
