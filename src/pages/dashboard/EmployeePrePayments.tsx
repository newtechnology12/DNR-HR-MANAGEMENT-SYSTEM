

import { useState } from "react";
import { useQuery } from "react-query";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { addDays } from "date-fns";
import DataTable from "@/components/DataTable";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import useConfirmModal from "@/hooks/useConfirmModal";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { PrepaymentFormModal } from "@/components/modals/PrepaymentFormModal";
import ConfirmModal from "@/components/modals/ConfirmModal";

function formatDate(inputDate: string) {
  const [year, month] = inputDate.split(".");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

export default function EmployeePrePayments({ employeeId }: { employeeId: string }) {
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState("");

  const handleDescriptionClick = (description: string) => {
    setSelectedDescription(description);
    setIsDescriptionModalOpen(true);
  };

  const DescriptionModal = () => (
    <Dialog open={isDescriptionModalOpen} onOpenChange={setIsDescriptionModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejected Reason</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-wrap">{selectedDescription}</div>
      </DialogContent>
    </Dialog>
  );

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
      accessorKey: "amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <div className="capitalize truncate">{Number(row.getValue("amount")).toLocaleString()} FRW</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("category")}</div>,
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("status")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "rejected_reason",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Message" />,
      cell: ({ row }) => {
        const rejectedReason = row.getValue("rejected_reason");
        if (!rejectedReason) return <div>---</div>;
        
        return (
          <Button
            variant="link"
            onClick={() => handleDescriptionClick(rejectedReason)}
            className="text-blue-500 hover:text-blue-700"
          >
            View Description
          </Button>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "approved_by",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Approved By" />,
      cell: ({ row }) => <div className="capitalize truncate">{row.getValue("approved_by") || "---"}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "rejected_by",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rejected By" />,
      cell: ({ row }) => <div className="capitalize truncate">{row.getValue("rejected_by") || "---"}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created At" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("created")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "updated",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("updated")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      id: "actions",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actions" />,
      cell: ({ row }) => {
        const status = row.getValue("status");
        return (
          <DataTableRowActions
            actions={[
              status === "rejected" && {
                label: "Edit and Resubmit",
                onClick: () => handleEditRejected(row.original),
              },
            ].filter(Boolean)}
            row={row}
          />
        );
      },
    },
  ];

  // Function to handle editing rejected requests
  const handleEditRejected = (rowData) => {
    editRow.setRow(rowData);
    editRow.setOpen(true);
  };

  const [searchText, setSearchText] = useState("");
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([{ id: "created", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const recordsQuery = useQuery({
    queryKey: ["prepayments", employeeId, { columnFilters, searchText, sorting, pagination }],
    queryFn: async () => {
      const searchQ = searchText ? `name~"${searchText}"` : "";
      const filters = columnFilters
        .map((e) => {
          if (e.value?.from) {
            return `created >= "${new Date(e.value.from).toISOString()}" && created <= "${new Date(
              e.value?.to || addDays(new Date(e.value.from), 1)
            ).toISOString()}"`;
          } else {
            return e.value.map((p) => `${e.id}="${p.id || p.value || p}"`).join(" || ");
          }
        })
        .join(" && ");

      const sorters = sorting.map((p) => `${p.desc ? "-" : "+"}${p.id}`).join(" && ");

      const response = await pocketbase.collection("prepayments").getList(pagination.pageIndex + 1, pagination.pageSize, {
        filter: [searchQ, filters, `employee="${employeeId}"`].filter(Boolean).join(" && "),
        sort: sorters,
        expand: "employee,created_by,transactions,expenseCategory,rejected_by,approved_by",
      });

      return {
        items: response.items.map((e) => ({
          id: e.id,
          amount: e.amount,
          category: e.expand?.expenseCategory?.name,
          categoryId: e.expenseCategory,
          status: e.status,
          approved_by: e.expand?.approved_by?.name || "---",
          rejected_by: e.expand?.rejected_by?.name || "---",
          rejected_reason: e.rejected_reason,
          created_by: e.expand?.created_by?.name,
          created: new Date(e.created).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" }),
          updated: new Date(e.updated).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" }),
          description: e.description,
          original: e,
        })),
        totalPages: response.totalPages,
      };
    },
    keepPreviousData: true,
    enabled: !!employeeId,
  });

  const newRecordModal = useModalState();
  const editRow = useEditRow();
  const confirmModal = useConfirmModal();

  const handleDelete = async (e: { id: string }) => {
    confirmModal.setIsLoading(true);
    try {
      await pocketbase.collection("prepayments").delete(e.id);
      recordsQuery.refetch();
      confirmModal.close();
      toast.success("Credit deleted successfully");
    } catch (error) {
      confirmModal.setIsLoading(false);
      toast.error(error.message);
    }
  };

  return (
    <>
      <DataTable
        className="p-0 border-none"
        isFetching={recordsQuery.isFetching}
        isLoading={recordsQuery.isLoading}
        data={recordsQuery.data?.items || []}
        columns={columns}
        onSearch={setSearchText}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={recordsQuery.data?.totalPages || 0}
        setPagination={setPagination}
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        Action={() => (
          <Button onClick={newRecordModal.open} size="sm" className="mr-2">
            Apply For Expense
          </Button>
        )}
        facets={[
          {
            title: "Status",
            name: "status",
            options: [
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
            ],
          },
          {
            title: "Payment Status",
            name: "payment_status",
            options: [
              { label: "Approved", value: "Approved" },
              { label: "Pending", value: "Pending" },
            ],
          },
        ]}
      />

      <PrepaymentFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={(isOpen) => {
          if (editRow.isOpen) {
            editRow.setOpen(isOpen);
          } else {
            newRecordModal.close();
          }
        }}
        open={newRecordModal.isOpen || editRow.isOpen}
        employeeId={employeeId}
        isEditMode={!!editRow.row} // Enable edit mode if row exists
        isRejectedEdit={editRow.row?.status === "rejected"} // Flag to indicate editing a rejected request
        isDisabled={editRow.row?.status === "approved"} // Disable form for approved requests
      />

      <ConfirmModal
        title="Are you sure you want to delete?"
        description="This action cannot be undone."
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={confirmModal.close}
      />

      <DescriptionModal />
    </>
  );
}