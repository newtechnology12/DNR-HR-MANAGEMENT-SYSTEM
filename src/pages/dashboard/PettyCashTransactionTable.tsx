import DataTable from "@/components/DataTable";
import { ColumnDef } from "@tanstack/react-table";
// import { useState } from "react";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
// import { PettyCashTransactionFormModal } from "./PettyCashTransactionFormModal";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { PettyCashTransactionFormModal } from "@/components/modals/PettyCashTransactionFormModal";

export default function PettyCashTransactionTable() {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <div>{new Date(row.getValue("date")).toLocaleDateString()}</div>,
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <div>{row.getValue("amount")}</div>,
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => <div>{row.getValue("description")}</div>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <div>{row.getValue("type")}</div>,
    },
    {
      accessorKey: "account",
      header: "Account",
      cell: ({ row }) => <div>{row.getValue("account")}</div>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <div>{row.getValue("category")}</div>,
    },
    {
      accessorKey: "user",
      header: "User",
      cell: ({ row }) => <div>{row.getValue("user")}</div>,
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => <div>{row.getValue("location")}</div>,
    },
    {
      accessorKey: "receipt",
      header: "Receipt",
      cell: ({ row }) => <div>{row.getValue("receipt")}</div>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              title: "Edit",
              onClick: () => editRow.edit(row.original),
            },
            {
              title: "Delete",
              onClick: () => confirmModal.open({ meta: row.original }),
            },
          ]}
          row={row}
        />
      ),
    },
  ];

  const confirmModal = useConfirmModal();
  const newRecordModal = useModalState();
  const editRow = useModalState();

  const handleDelete = (record) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("pettyCashTransactions")
      .delete(record.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Transaction deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const recordsQuery = useQuery({
    queryKey: ["pettyCashTransactions"],
    queryFn: () => pocketbase.collection("pettyCashTransactions").getFullList(),
  });

  return (
    <>
      <Button onClick={() => newRecordModal.open()}>Create Transaction</Button>
      <DataTable
        data={recordsQuery.data || []}
        columns={columns}
        isLoading={recordsQuery.isLoading}
        isFetching={recordsQuery.isFetching}
        isError={recordsQuery.isError}
        isRefetching={recordsQuery.isRefetching}
        meta={recordsQuery.meta}
        
      />
      <PettyCashTransactionFormModal
        open={newRecordModal.isOpen || editRow.isOpen}
        setOpen={newRecordModal.isOpen ? newRecordModal.setisOpen : editRow.setisOpen}
        record={editRow.row}
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
      />
      <ConfirmModal
        title="Are you sure you want to delete?"
        description="This action cannot be undone."
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}