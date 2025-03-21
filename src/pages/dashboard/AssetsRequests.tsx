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
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/utils";
import { useRoles } from "@/context/roles.context";
import formatFilter from "@/utils/formatFilter";
import { PettryCashRequestModal } from "@/components/modals/PettryCashRequestModal";
import { AssetRequestModal } from "@/components/modals/AssetRequestModal";

export default function AssetsRequests() {
  const { canPerform } = useRoles();
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
      accessorKey: "asset",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Asset" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("asset") || "N.A"}
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "requested_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Requested by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("requested_by") || "---"}
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
      accessorKey: "created",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("created")}</div>
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
              title: "Approve request",
              onClick: (e) => {
                setrequestToApprove(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected" ||
                !canPerform("approve_or_reject_request"),
            },
            {
              title: "Reject request",
              onClick: (e) => {
                setrequestToReject(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected" ||
                !canPerform("approve_or_reject_request"),
            },
          ]}
          row={row}
        />
      ),
    },
  ];

  const [requestToApprove, setrequestToApprove] = useState(null);
  const [requestToReject, setrequestToReject] = useState(null);

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

  const [activeTab, setactiveTab] = useState("pending");

  const { user } = useAuth();

  const recordsQuery = useQuery({
    queryKey: [
      "assets_requests",
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
      const searchQ = searchText ? `employee.name~"${searchText}"` : "";

      const filters = formatFilter(columnFilters);

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      const permView = canPerform("view_all_assets_requests")
        ? ""
        : `requested_by="${user.id}"`;

      return pocketbase
        .collection("assets_requests")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`, permView]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: `requested_by,asset`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                asset: e?.expand?.asset?.name,
                amount: e.amount,
                status: e.status,
                requested_by: e.expand?.requested_by?.name,
                created: new Date(e.created).toLocaleDateString("en-US", {
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
      .collection("petty_cash_requests")
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
              Petty Cash Requests.
            </h2>
            <BreadCrumb
              items={[
                {
                  title: `Petty Cash Requests.`,
                  link: `/dashboard`,
                },
              ]}
            />
          </div>
          <Button onClick={() => newRecordModal.open()} size="sm">
            <PlusCircle size={16} className="mr-2" />
            <span>Request Asset.</span>
          </Button>
        </div>
        <div className=" bg-white scroller border-t border-l border-r rounded-t">
          <ScrollArea className="w-full  whitespace-nowrap">
            <div className="flex px-2 items-center  justify-start">
              {[
                { title: "Pending Requests", name: "pending" },
                { title: "Approved Requests", name: "approved" },
                { title: "Rejected Requests", name: "rejected" },
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
              title: "Requested by",
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
              name: "requested_by",
              type: "async-options",
            },
            {
              title: "Asset",
              loader: ({ search }) => {
                return pocketbase
                  .collection("assets")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "asset",
              type: "async-options",
            },
          ]}
        />
      </div>

      <AssetRequestModal
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
        request={requestToApprove || requestToReject}
        type={requestToApprove ? "approve" : requestToReject ? "reject" : null}
        open={!!requestToApprove || !!requestToReject}
        setOpen={(e) => {
          if (!e) {
            setrequestToApprove(null);
            setrequestToReject(null);
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

function ApproveOrRejectModal({ type, open, setOpen, request, onCompleted }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { user } = useAuth();

  const onSubmit = async (values) => {
    try {
      await pocketbase.collection("assets_requests").update(request.id, {
        status: type === "approve" ? "approved" : "rejected",
        [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
        [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
        [type === "approve" ? "approved_reason" : "rejected_reason"]:
          values.reason,
      });

      if (type === "approve") {
        await pocketbase.collection("assets").update(request.asset, {
          status: "assigned",
          assigned_to: request.requested_by,
        });
      }

      setOpen(false);
      toast.success(
        `Request ${type === "approve" ? "approved" : "rejected"} succesfully`
      );
      onCompleted();
      form.reset();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-1 font-semibold py-2">
              {type === "approve" ? "Approve request." : "Reject request"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {type === "approve" ? "approve" : "reject"}{" "}
              a request.
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
                  {type === "approve" ? "Approve request." : "Reject request"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
