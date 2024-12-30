import DataTable from "@/components/DataTable";
import { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { PettyCashGroupFormModal } from "./PettyCashGroupFormModal";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";

export default function PettyCashGroupTable() {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <div>{row.getValue("name")}</div>,
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => <div>{row.getValue("description")}</div>,
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
      .collection("pettyCashGroups")
      .delete(record.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Group deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const recordsQuery = useQuery({
    queryKey: ["pettyCashGroups"],
    queryFn: () => pocketbase.collection("pettyCashGroups").getFullList(),
  });

  return (
    <>
      <Button onClick={() => newRecordModal.open()}>Create Group</Button>
      <DataTable
        data={recordsQuery.data || []}
        columns={columns}
        isLoading={recordsQuery.isLoading}
      />
      <PettyCashGroupFormModal
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