import { useState } from "react";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";
import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import BreadCrumb from "@/components/breadcrumb";
import ClientFormModal from "@/components/modals/ClientsModelForm";
import StatCard from "@/components/StatCard";
import { UserPlus, Users } from "lucide-react";

export default function ClientManagement() {
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
      accessorKey: "clientName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client Name" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("clientName");
        return (
          <button
            type="button"
            onClick={() => editRow.edit(row.original)}
            className="capitalize hover:text-primary hover:underline"
          >
            {typeof value === "string" ? value : "N/A"}
          </button>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clientType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client Type" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("clientType");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clientCategory",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client Category" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("clientCategory");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clientTIN",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client TIN" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("clientTIN");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "phoneNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Phone Number" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("phoneNumber");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "emailAddress",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email Address" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("emailAddress");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "country",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Country" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("country");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
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
              title: "Edit client",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "Delete client",
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
      id: "clientName",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "clients",
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
        .map((p) => {
          return `${p.desc ? "-" : "+"}${p.id}`;
        })
        .join(",");

      return pocketbase
        .collection("clients")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join(" && "),
            sort: sorters,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((record) => {
              return {
                id: record.id,
                clientName: record.clientName || 'N/A',
                clientType: record.clientType || 'N/A',
                clientCategory: record.clientCategory || 'N/A',
                clientTIN: record.clientTIN || 'N/A',
                phoneNumber: record.phoneNumber || 'N/A',
                emailAddress: record.emailAddress || 'N/A',
                country: record.country || 'N/A',
                original: record,
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("clients")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Client deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const statsQuery = useQuery({
    queryKey: ["clients-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString();

      const [total, newThisMonth] = await Promise.all([
        pocketbase.collection("clients").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("clients")
          .getList(1, 1, { filter: `created >= "${startOfMonth}"` })
          .then((e) => e.totalItems),
      ]);
      return { total, newThisMonth };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      <div className="px-4">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            title="Total Clients"
            icon={Users}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All registered clients"
          />
          <StatCard
            title="New This Month"
            icon={UserPlus}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.newThisMonth}
            description="Clients added this month"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              All Clients
            </h2>
            <BreadCrumb
              items={[{ title: "View Clients", link: "/dashboard" }]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TableTools
              importConfig={IMPORTS.clients}
              onImported={() => recordsQuery.refetch()}
              exportConfig={{
                title: "Partners", fileName: "partners", what: "clients",
                rows: () => pocketbase.collection("clients").getFullList({ sort: "name" }),
                columns: [
                  { header: "Name", value: (r: any) => r.name, width: 30 },
                  { header: "Contact person", value: (r: any) => r.contact_person || "" },
                  { header: "E-mail", value: (r: any) => r.email || "" },
                  { header: "Phone", value: (r: any) => r.phone || "" },
                  { header: "Address", value: (r: any) => r.address || "" },
                  { header: "Sector", value: (r: any) => r.industry || "" },
                ],
              }}
            />
            <Button onClick={() => newRecordModal.open()} size="sm">
              <PlusCircle size={16} className="mr-2" />
              <span>Create new Client</span>
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


      <ClientFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        client={editRow.row}
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