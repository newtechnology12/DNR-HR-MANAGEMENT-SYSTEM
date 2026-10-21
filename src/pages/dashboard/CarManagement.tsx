import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import TableTools from "@/components/enterprise/TableTools";
import { EXPORTS } from "@/lib/exportConfigs";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { CarRequestForm } from "@/components/Carmodel/CarRequestForm";
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
import { Car, CheckCircle2, Clock, XCircle } from "lucide-react";

// const capitalizeFirstLetter = (str) => {
//   return str.charAt(0).toUpperCase() + str.slice(1);
// };

export default function CarManagement() {
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
        <button
          type="button"
          onClick={() => editRow.edit(row.original)}
          className="capitalize hover:text-primary hover:underline"
        >
          {row.getValue("employee")}
        </button>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "position",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Position" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("position")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "startTime",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Start Time" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("startTime")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "endTime",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="End Time" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("endTime")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "purpose",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Purpose" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("purpose")}</div>
      ),
      enableSorting: true,
      filterFn: (__, _, value) => {
        return value;
      },
      enableHiding: true,
    },
    {
      accessorKey: "starting_km",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Starting KM" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("starting_km")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "ending_km",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ending KM" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("ending_km")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "totalKm",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total KM" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("totalKm")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "totalExpenses",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total Expenses" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("totalExpenses")}</div>
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
              title: "Edit CarRequests",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "Approve CarRequests",
              onClick: (e) => {
                setCarToApprove(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected",
            },
            {
              title: "Reject CarRequests",
              onClick: (e) => {
                setCarToReject(e.original);
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

  const [CarToApprove, setCarToApprove] = useState(null);
  const [carToReject, setCarToReject] = useState(null);

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
      "CarRequests",
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
        .collection("CarRequests")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`]
              .filter((e) => e)
              .join(" && "),
            sort: sorters,
            expand: `users,created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e?.expand?.users?.name,
                created_by: e.expand?.created_by?.name,
                startTime: new Date(e.start).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                endTime: new Date(e.end).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                purpose: e.purpose,
                position: e.position,
                starting_km: e.starting_km,
                ending_km: e.ending_km,
                totalKm: e.totalKm,
                expense_amount: e.expense_amount,
                totalExpenses: e.totalExpenses,
                status: e.status,
                approved_at: new Date(e.start).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                reason: e.reason,
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

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("CarRequests")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Car request deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const statsQuery = useQuery({
    queryKey: ["car-requests-stats"],
    queryFn: async () => {
      const [total, pending, approved, rejected] = await Promise.all([
        pocketbase.collection("CarRequests").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("CarRequests")
          .getList(1, 1, { filter: `status="pending"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("CarRequests")
          .getList(1, 1, { filter: `status="approved"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("CarRequests")
          .getList(1, 1, { filter: `status="rejected"` })
          .then((e) => e.totalItems),
      ]);
      return { total, pending, approved, rejected };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      <div className="px-4">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Requests"
            icon={Car}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All car requests"
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
            description="Approved car requests"
          />
          <StatCard
            title="Rejected"
            icon={XCircle}
            tone="danger"
            loading={statsLoading}
            value={statsQuery.data?.rejected}
            description="Rejected car requests"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Car Requests
            </h2>
            <BreadCrumb
              items={[{ title: "Car Requests ", link: "/dashboard" }]}
            />
          </div>
          {/* <Button onClick={() => newRecordModal.open()} size="sm">
            <PlusCircle size={16} className="mr-2" />
            <span>Create new CarRequests.</span>
          </Button> */}
        </div>
        <div className="bg-white scroller border-t border-l border-r rounded-t">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex px-2 items-center justify-start">
              {[
                { title: "Pending Leaves", name: "pending" },
                { title: "Approved Leaves", name: "approved" },
                { title: "Rejected Leaves", name: "rejected" },
              ].map((e, i) => {
                return (
                  <a
                    key={i}
                    className={cn(
                      "cursor-pointer px-6 capitalize text-center relative w-full text-slate-700 text-[13px] sm:text-sm py-3 font-medium",
                      {
                        "text-primary ": activeTab === e.name,
                      }
                    )}
                    onClick={() => {
                      setActiveTab(e.name);
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
          isFetching={recordsQuery.isFetching}
          defaultColumnVisibility={{
            select: true,
            employee: true,
            position: true,
            startTime: true,
            endTime: true,
            purpose: true,
            starting_km: true,
            ending_km: true,
            totalKm: true,
            totalExpenses: true,
            created: true,
            actions: true,
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
          Action={() =>{
            return <span className="mr-2 inline-flex items-center gap-2">
            <TableTools exportConfig={EXPORTS.vehicleRequests()} />
            <Button onClick={() => newRecordModal.open()} size="sm">
            <PlusCircle size={16} className="mr-2" />
            <span>Request a vehicle</span>
          </Button>
          </span>
          }}
          facets={[
            {
              title: "Status",
              items: [
                { title: "Pending", value: "pending" },
                { title: "Approved", value: "approved" },
                { title: "Rejected", value: "rejected" },
              ],
            }
          ]}
        />
      </div>

      <CarRequestForm
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
        car={CarToApprove || carToReject}
        type={CarToApprove ? "approve" : carToReject ? "reject" : null}
        open={!!CarToApprove || !!carToReject}
        setOpen={(e) => {
          if (!e) {
            setCarToApprove(null);
            setCarToReject(null);
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

function ApproveOrRejectModal({ type, open, setOpen, car, onCompleted }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { user } = useAuth();

  const onSubmit = (values) => {
    return pocketbase
      .collection("CarRequests")
      .update(car.id, {
        status: type === "approve" ? "approved" : "rejected",
        [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
        [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
        [type === "approve" ? "approved_reason" : "rejected_reason"]:
          values.reason,
      })
      .then(() => {
        setOpen(false);
        toast.success(
          `Car ${type === "approve" ? "approved" : "rejected"} successfully`
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
              {type === "approve" ? "Approve leave." : "Reject leave"}
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
                  {type === "approve" ? "Approve leave." : "Reject leave"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
