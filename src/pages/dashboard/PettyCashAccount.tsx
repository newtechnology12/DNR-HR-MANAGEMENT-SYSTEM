import DataTable from "@/components/DataTable";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { PettyCashAccountFormModal } from "@/components/modals/PettyCashAccountFormModal";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";

export default function PettyCashAccountTable() {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <div>{row.getValue("name")}</div>,
    },
    {
      accessorKey: "balance",
      header: "Balance",
      cell: ({ row }) => <div>{row.getValue("balance")}</div>,
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => <div>{row.getValue("description")}</div>,
    },
    {
      accessorKey: "group",
      header: "Group",
      cell: ({ row }) => <div>{row.original.group.name}</div>,
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
      .collection("pettyCashAccounts")
      .delete(record.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Account deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const recordsQuery = useQuery({
    queryKey: ["pettyCashAccounts"],
    queryFn: () =>
      pocketbase.collection("pettyCashAccounts").getFullList({
        expand: "group",
      }),
  });

  return (
    <>
      <Button onClick={() => newRecordModal.open()}>Create Account</Button>
      <DataTable
        data={recordsQuery.data || []}
        columns={columns}
        isLoading={recordsQuery.isLoading}
      />
      <PettyCashAccountFormModal
        open={newRecordModal.isOpen || editRow.isOpen}
        setOpen={
          newRecordModal.isOpen ? newRecordModal.setisOpen : editRow.setisOpen
        }
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
