import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import { Badge } from "@/components/ui/badge";
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
import { LeaveFormModal, leaveTypeLabel } from "@/components/modals/LeaveFormModal";
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
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import AppFormTextArea from "@/components/forms/AppFormTextArea";
import Loader from "@/components/icons/Loader";
import { useAuth } from "@/context/auth.context";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/utils/cn";
import formatFilter from "@/utils/formatFilter";
import StatCard from "@/components/StatCard";
import { CalendarDays, CheckCircle2, Clock, XCircle } from "lucide-react";

const capitalizeFirstLetter = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export default function Leaves() {
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
        <DataTableColumnHeader column={column} title="Employee" />
      ),
      cell: ({ row }) => (
        <Link
          to={`/dashboard/hr/employees/${row.original.original?.employee}`}
          className="hover:underline flex items-center gap-2 capitalize hover:text-primary"
        >
          {row.getValue("employee")}
        </Link>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "start",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Start" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("start")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "end",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="End" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("end")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "Leaveduration",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Days" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("Leaveduration")}</div>
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
        const status = row.getValue("status") as string;
        return (
          <Badge
            variant={
              status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"
            }
            className="capitalize"
          >
            {status}
          </Badge>
        );
      },
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },

    {
      accessorKey: "approved_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Approved By" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("approved_by")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "rejected_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Rejected By" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("rejected_by")}</div>
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
      accessorKey: "type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{leaveTypeLabel(row.original)}</div>
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
              title: "Edit leave",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "Approve leave",
              onClick: (e) => {
                setleaveToApprove(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected",
            },
            {
              title: "Reject leave",
              onClick: (e) => {
                setleaveToReject(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected",
            },
            {
              title: "Delete leave",
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

  const [leaveToApprove, setleaveToApprove] = useState(null);
  const [leaveToReject, setleaveToReject] = useState(null);

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

  const [activeTab, setActiveTab] = useState("pending");

  const recordsQuery = useQuery({
    queryKey: [
      "leaves",
      {
        columnFilters,
        search: searchText,
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
        .collection("leaves")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`]
              .filter((e) => e)
              .join(" && "),
            sort: sorters,
            expand: `employee,created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e?.expand?.employee?.name,
                created_by: e.expand?.created_by?.name,
                start: new Date(e.start).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                end: new Date(e.end).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                Leaveduration: e.Leaveduration,
                type: e.type,
                status: e.status,
                approved_by: e.approved_by || "---",
                rejected_by: e.rejected_by || "---",
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                updated: new Date(e.created).toLocaleDateString("en-US", {
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
    queryKey: ["leaves-stats"],
    queryFn: async () => {
      const [total, pending, approved, rejected] = await Promise.all([
        pocketbase.collection("leaves").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("leaves")
          .getList(1, 1, { filter: `status="pending"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("leaves")
          .getList(1, 1, { filter: `status="approved"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("leaves")
          .getList(1, 1, { filter: `status="rejected"` })
          .then((e) => e.totalItems),
      ]);
      return { total, pending, approved, rejected };
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
      .collection("leaves")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Leave deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  return (
    <>
      <div className="px-4 py-4 sm:px-6">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Leaves"
            icon={CalendarDays}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All leave requests"
          />
          <StatCard
            title="Pending"
            icon={Clock}
            tone="warning"
            loading={statsLoading}
            value={statsQuery.data?.pending}
            description="Awaiting approval"
          />
          <StatCard
            title="Approved"
            icon={CheckCircle2}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.approved}
            description="Approved leave requests"
          />
          <StatCard
            title="Rejected"
            icon={XCircle}
            tone="danger"
            loading={statsLoading}
            value={statsQuery.data?.rejected}
            description="Rejected leave requests"
          />
        </div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Leaves & Holidays
            </h2>
            <BreadCrumb
              items={[{ title: "Leaves & Holidays", link: "/dashboard" }]}
            />
          </div>
          <Button onClick={() => newRecordModal.open()} size="sm">
            <PlusCircle size={16} />
            <span>Request Leave</span>
          </Button>
        </div>
        <div className="rounded-t-card border-l border-r border-t border-slate-200 bg-white">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex items-center justify-start px-2">
              {[
                { title: "Pending Leaves", name: "pending" },
                { title: "Approved Leaves", name: "approved" },
                { title: "Rejected Leaves", name: "rejected" },
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
                      setActiveTab(e.name);
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
          isFetching={recordsQuery.isFetching}
          defaultColumnVisibility={{
            created_by: false,
            approved_by: false,
            rejected_by: false,
            updated: false,
          }}
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
              title: "Type",
              name: "type",
              options: [
                "annual",
                "maternity",
                "paternity",
                "sick",
                "study",
                "unpaid",
                "other",
              ].map((e) => ({ label: capitalizeFirstLetter(e), value: e })),
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
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "employee",
              type: "async-options",
            },
          ]}
        />
      </div>

      <LeaveFormModal
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
        description={"This action cannot be undone. This will permanently delete the selected record."}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />

      <ApproveOrRejectModal
        leave={leaveToApprove || leaveToReject}
        type={leaveToApprove ? "approve" : leaveToReject ? "reject" : null}
        open={!!leaveToApprove || !!leaveToReject}
        setOpen={(e) => {
          if (!e) {
            setleaveToApprove(null);
            setleaveToReject(null);
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

function ApproveOrRejectModal({ type, open, setOpen, leave, onCompleted }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { user } = useAuth();

  const onSubmit = (values) => {
    return pocketbase
      .collection("leaves")
      .update(leave.id, {
        status: type === "approve" ? "approved" : "rejected",
        [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
        [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
        [type === "approve" ? "approved_reason" : "rejected_reason"]:
          values.reason,
      })
      .then(() => {
        setOpen(false);
        toast.success(
          `Leave ${type === "approve" ? "approved" : "rejected"} successfully`
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
              {type === "approve" ? "Approve leave" : "Reject leave"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {type === "approve" ? "approve" : "reject"}{" "}
              a leave.
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
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button
                  type="submit"
                  disabled={
                    form.formState.disabled || form.formState.isSubmitting
                  }
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {type === "approve" ? "Approve leave" : "Reject leave"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
