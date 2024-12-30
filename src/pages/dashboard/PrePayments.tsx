import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { PrepaymentFormModal } from "@/components/modals/PrepaymentFormModal";
import { addDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/auth.context";
import AppFormTextArea from "@/components/forms/AppFormTextArea";
import Loader from "@/components/icons/Loader";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";

function formatDate(inputDate) {
  // Split the input string into year and month parts
  var parts = inputDate.split(".");

  // Create a new Date object with the provided year and month
  var date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);

  // Format the date in a readable format
  var formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  // i want to add column of TOtal all the amount on the table
//please help me with making logic for that

const totalAmount = recordsQuery?.data?.items.reduce((acc, item) => {
  return acc + item.amount;
})



  // Return the formatted date
  return formattedDate;
}

export default function Prepayments() {
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
      accessorKey: "employee",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={"Employee"} />
      ),
      cell: ({ row }) => (
        <Link
          to={`/employees/${row.original.original.expand?.employee?.id}`}
          className="capitalize"
        >
          {row.getValue("employee")}
        </Link>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "position",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="position" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("position")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "reason",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Reason" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("reason")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {Number(row.getValue("amount")).toLocaleString()} FRW
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    // {
    //   accessorKey: "paid_amount",
    //   header: ({ column }) => (
    //     <DataTableColumnHeader column={column} title="Received" />
    //   ),
    //   cell: ({ row }) => (
    //     <div className="capitalize">
    //       {Number(row.getValue("paid_amount")).toLocaleString()} FRW
    //     </div>
    //   ),
    //   filterFn: (__, _, value) => {
    //     return value;
    //   },
    //   enableSorting: true,
    //   enableHiding: true,
    // },
    // {
    //   accessorKey: "remaining_amount",
    //   header: ({ column }) => (
    //     <DataTableColumnHeader column={column} title="Remaining Amount" />
    //   ),
    //   cell: ({ row }) => (
    //     <div className="capitalize">
    //       {Number(row.getValue("remaining_amount")).toLocaleString()} FRW
    //     </div>
    //   ),
    //   filterFn: (__, _, value) => {
    //     return value;
    //   },
    //   enableSorting: true,
    //   enableHiding: true,
    // },
    {
      accessorKey: "deduction_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Deduction" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("deduction_date")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "particularly",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Particularly" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("particularly")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "momoNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Momo Code" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("momoNumber")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "momoName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Momo Name" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("momoName")}</div>
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
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("status")}</div>
      ),
      filterFn: (__, _, value) => { 
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total Amount" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("totalAmount")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "attachment",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Attachment" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("attachment")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("created_by")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "payment_status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Approved by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("payment_status")}</div>
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
              title: "Edit advance",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "Approve advance",
              onClick: (e) => {
                setloanToApprove(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected",
            },
            {
              title: "Reject loan",
              onClick: (e) => {
                setloanToReject(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected",
            },
            {
              title: "Delete loan",
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

  const [loanToApprove, setloanToApprove] = useState(null);
  const [loanToReject, setloanToReject] = useState(null);

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
      "prepayments",
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
      const searchQ = searchText ? `employee.name~"${searchText}"` : "";
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
        .collection("prepayments")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `employee!=""`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: `employee,created_by,transactions`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e.expand?.employee?.name,
                position: e.position,
                reason: e.reason,
                attachment: e.attachment,
                momoNumber: e.momoNumber,
                momoName: e.momoName,
                particularly: e.particularly,
                totalAmount: e.totalAmount,
                amount: e.amount,
                paid_amount:
                  e?.expand?.transactions
                    ?.map((e) => e.amount)
                    .reduce((a, b) => a + b, 0) || -0,
                remaining_amount:
                  e.amount -
                  (e?.expand?.transactions
                    ?.map((e) => e.amount)
                    .reduce((a, b) => a + b, 0) || -0),
                payment_status: e.payment_status,
                status: e.status,
                created_by: e.expand?.created_by?.name,
                deduction_date: new Date(e.deduction_date).toLocaleDateString(
                  "en-US",
                  {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  }
                ),
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

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("prepayments")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("credit deleted succesfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  return (
    <>
      <div className="px-4">
        <div className="flex pb-2 items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-[17px] font-semibold capitalize tracking-tight">
            Staff Expense Request
            </h2>
            <BreadCrumb
              items={[
                {
                  title: `Staff Expense Request`,
                  link: `/prepayments`,
                },
              ]}
            />
          </div>
          <Button onClick={() => newRecordModal.open()} size="sm">
            <PlusCircle size={16} className="mr-2" />
            <span>Add new Expense Request.</span>
          </Button>
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
                { label: "Pending", value: "pending" },
                { label: "Approved", value: "approved" },
                { label: "Rejected", value: "rejected" },
              ],
            },
            {
              title: "Approved by",
              name: "payment_status",
              options: [
                { label: "Approved", value: "Approved" },
                { label: "Pending", value: "Pending" },
              ],
            },
            {
              title: "Created by",
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
              name: "created_by",
              type: "async-options",
            },
            {
              title: "Employee",
              loader: ({ search }) => {
                return pocketbase
                  .collection("users")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) =>
                    e.map((e) => ({ label: e.names || e.name, value: e.id }))
                  );
              },
              name: "employee",
              type: "async-options",
            },
          ]}
        />
      </div>

      <PrepaymentFormModal
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
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
        a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />

      <ApproveOrRejectModal
        loan={loanToApprove || loanToReject}
        type={loanToApprove ? "approve" : loanToReject ? "reject" : null}
        open={!!loanToApprove || !!loanToReject}
        setOpen={(e) => {
          if (!e) {
            setloanToApprove(null);
            setloanToReject(null);
          }
        }}
        onCompleted={() => {
          recordsQuery.refetch();
        }}
      />
    </>
  );
}

const formSchema = z.object({
  reason: z.string().min(1, { message: "Please enter a reason" }),
});

function ApproveOrRejectModal({ type, open, setOpen, loan, onCompleted }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { user } = useAuth();

  const onSubmit = (values) => {
    return pocketbase
      .collection("prepayments")
      .update(loan.id, {
        status: type === "approve" ? "approved" : "rejected",
        [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
        [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
        [type === "approve" ? "approved_reason" : "rejected_reason"]:
          values.reason,
      })
      .then(() => {
        setOpen(false);
        toast.success(
          `Loan ${type === "approve" ? "approved" : "rejected"} succesfully`
        );
        onCompleted();
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-1 font-semibold py-2">
              {type === "approve" ? "Approve advance." : "Reject advance"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {type === "approve" ? "approve" : "reject"}{" "}
              a advance.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div>
                <AppFormTextArea
                  form={form}
                  label={"Enter a reason"}
                  placeholder={"Enter reason"}
                  name={"reason"}
                />
              </div>
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="submit"
                  onClick={() => form.handleSubmit(onSubmit)}
                  disabled={
                    form.formState.disabled || form.formState.isSubmitting
                  }
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {type === "approve" ? "Approve advance." : "Reject advance"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
