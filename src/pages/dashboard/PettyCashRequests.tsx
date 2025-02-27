// import DataTable from "@/components/DataTable";
// import { ColumnDef, PaginationState } from "@tanstack/react-table";
// import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
// import { Checkbox } from "@/components/ui/checkbox";
// import { PlusCircle } from "lucide-react";
// import pocketbase from "@/lib/pocketbase";
// import cleanObject from "@/utils/cleanObject";
// import { useState } from "react";
// import { useQuery } from "react-query";
// import BreadCrumb from "@/components/breadcrumb";
// import { Button } from "@/components/ui/button";
// import useModalState from "@/hooks/useModalState";
// import useEditRow from "@/hooks/use-edit-row";
// import DataTableRowActions from "@/components/datatable/DataTableRowActions";
// import ConfirmModal from "@/components/modals/ConfirmModal";
// import useConfirmModal from "@/hooks/useConfirmModal";
// import { toast } from "sonner";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { zodResolver } from "@hookform/resolvers/zod";
// import { z } from "zod";
// import { useAuth } from "@/context/auth.context";
// import AppFormTextArea from "@/components/forms/AppFormTextArea";
// import Loader from "@/components/icons/Loader";
// import { useForm } from "react-hook-form";
// import { Form } from "@/components/ui/form";
// import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
// import { cn } from "@/utils";
// import { useRoles } from "@/context/roles.context";
// import formatFilter from "@/utils/formatFilter";
// import { PettryCashRequestModal } from "@/components/modals/PettryCashRequestModal";

// export default function PettyCashRequests() {
//   const { canPerform } = useRoles();
//   const columns: ColumnDef<any>[] = [
//     {
//       id: "select",
//       header: ({ table }) => (
//         <Checkbox
//           // @ts-ignore
//           checked={
//             table.getIsAllPageRowsSelected() ||
//             (table.getIsSomePageRowsSelected() && "indeterminate")
//           }
//           onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
//           aria-label="Select all"
//           className="translate-y-[2px]"
//         />
//       ),
//       cell: ({ row }) => (
//         <Checkbox
//           checked={row.getIsSelected()}
//           onCheckedChange={(value) => row.toggleSelected(!!value)}
//           aria-label="Select row"
//           className="translate-y-[2px]"
//         />
//       ),
//       enableSorting: false,
//       enableHiding: false,
//     },
//     {
//       accessorKey: "requested_by",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Requested by" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {row.getValue("requested_by") || "---"}
//         </div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "account",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Account" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {row.getValue("account") || "N.A"}
//         </div>
//       ),
//       enableSorting: false,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "amount",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Amount" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {Number(row.getValue("amount")).toLocaleString()} FRW
//         </div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "status",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Status" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("status")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "created",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Created at" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">{row.getValue("created")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       id: "actions",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Actions" />
//       ),
//       cell: ({ row }) => (
//         <DataTableRowActions
//           actions={[
//             {
//               title: "Approve request",
//               onClick: (e) => {
//                 setrequestToApprove(e.original);
//               },
//               disabled:
//                 row.original.status === "approved" ||
//                 row.original.status === "rejected" ||
//                 !canPerform("approve_or_reject_request"),
//             },
//             {
//               title: "Reject request",
//               onClick: (e) => {
//                 setrequestToReject(e.original);
//               },
//               disabled:
//                 row.original.status === "approved" ||
//                 row.original.status === "rejected" ||
//                 !canPerform("approve_or_reject_request"),
//             },
//           ]}
//           row={row}
//         />
//       ),
//     },
//   ];

//   const [requestToApprove, setrequestToApprove] = useState(null);
//   const [requestToReject, setrequestToReject] = useState(null);

//   const [searchText, setsearchText] = useState("");

//   const [columnFilters, setColumnFilters] = useState([]);
//   const [sorting, setSorting] = useState([
//     {
//       id: "created",
//       desc: true,
//     },
//   ]);

//   const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
//     pageIndex: 0,
//     pageSize: 10,
//   });

//   const [activeTab, setactiveTab] = useState("pending");

//   const recordsQuery = useQuery({
//     queryKey: [
//       "petty_cash_requests",
//       {
//         columnFilters,
//         search: searchText,
//         sort: sorting,
//         pageIndex,
//         pageSize,
//         activeTab,
//       },
//     ],
//     keepPreviousData: true,
//     queryFn: () => {
//       const searchQ = searchText ? `employee.name~"${searchText}"` : "";

//       const filters = formatFilter(columnFilters);

//       const sorters = sorting
//         .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
//         .join(" && ");

//       return pocketbase
//         .collection("petty_cash_requests")
//         .getList(pageIndex + 1, pageSize, {
//           ...cleanObject({
//             filter: [searchQ, filters, `status="${activeTab}"`]
//               .filter((e) => e)
//               .join("&&"),
//             sort: sorters,
//             expand: `requested_by,account`,
//           }),
//         })
//         .then((e) => {
//           return {
//             items: e?.items?.map((e) => {
//               return {
//                 id: e.id,
//                 account: e?.expand?.account?.name,
//                 amount: e.amount,
//                 status: e.status,
//                 requested_by: e.expand?.requested_by?.name,
//                 created: new Date(e.created).toLocaleDateString("en-US", {
//                   day: "2-digit",
//                   month: "long",
//                   year: "numeric",
//                 }),
//                 original: e,
//               };
//             }),
//             totalPages: e.totalPages,
//           };
//         });
//     },
//     enabled: true,
//   });

//   const newRecordModal = useModalState();

//   const editRow = useEditRow();

//   const confirmModal = useConfirmModal();

//   const handleDelete = (e) => {
//     confirmModal.setIsLoading(true);
//     return pocketbase
//       .collection("petty_cash_requests")
//       .delete(e.id)
//       .then(() => {
//         recordsQuery.refetch();
//         confirmModal.close();
//         toast.success("credit deleted succesfully");
//       })
//       .catch((e) => {
//         confirmModal.setIsLoading(false);
//         toast.error(e.message);
//       });
//   };

//   return (
//     <>
//       <div className="px-4">
//         <div className="flex pb-2 items-start justify-between space-y-2">
//           <div className="flex items-start gap-2 flex-col">
//             <h2 className="text-[17px] font-semibold capitalize tracking-tight">
//               Petty Cash Requests.
//             </h2>
//             <BreadCrumb
//               items={[
//                 {
//                   title: `Petty Cash Requests.`,
//                   link: `/dashboard`,
//                 },
//               ]}
//             />
//           </div>
//           <Button onClick={() => newRecordModal.open()} size="sm">
//             <PlusCircle size={16} className="mr-2" />
//             <span>Request Petty Cash.</span>
//           </Button>
//         </div>
//         <div className=" bg-white scroller border-t border-l border-r rounded-t">
//           <ScrollArea className="w-full  whitespace-nowrap">
//             <div className="flex px-2 items-center  justify-start">
//               {[
//                 { title: "Pending Requests", name: "pending" },
//                 { title: "Approved Requests", name: "approved" },
//                 { title: "Rejected Requests", name: "rejected" },
//               ].map((e, i) => {
//                 return (
//                   <a
//                     key={i}
//                     className={cn(
//                       "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
//                       {
//                         "text-primary ": activeTab === e.name,
//                       }
//                     )}
//                     onClick={() => {
//                       setactiveTab(e.name);
//                     }}
//                   >
//                     {activeTab === e.name && (
//                       <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
//                     )}
//                     <span className=""> {e.title}</span>
//                   </a>
//                 );
//               })}
//             </div>
//             <ScrollBar orientation="horizontal" />
//           </ScrollArea>
//         </div>
//         <DataTable
//           isFetching={recordsQuery.isFetching}
//           defaultColumnVisibility={{}}
//           isLoading={recordsQuery.status === "loading"}
//           data={recordsQuery?.data?.items || []}
//           columns={columns}
//           onSearch={(e) => {
//             setsearchText(e);
//           }}
//           sorting={sorting}
//           setSorting={setSorting}
//           pageCount={recordsQuery?.data?.totalPages}
//           setPagination={setPagination}
//           pageIndex={pageIndex}
//           pageSize={pageSize}
//           setColumnFilters={setColumnFilters}
//           columnFilters={columnFilters}
//           facets={[
//             {
//               title: "Requested by",
//               loader: ({ search }) => {
//                 return pocketbase
//                   .collection("users")
//                   .getFullList(
//                     cleanObject({
//                       filter: search ? `name~"${search}"` : "",
//                     })
//                   )
//                   .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
//               },
//               name: "requested_by",
//               type: "async-options",
//             },
//             {
//               title: "Account",
//               loader: ({ search }) => {
//                 return pocketbase
//                   .collection("accounts")
//                   .getFullList(
//                     cleanObject({
//                       filter: search ? `name~"${search}"` : "",
//                     })
//                   )
//                   .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
//               },
//               name: "account",
//               type: "async-options",
//             },
//           ]}
//         />
//       </div>

//       <PettryCashRequestModal
//         onComplete={() => {
//           recordsQuery.refetch();
//           newRecordModal.close();
//           editRow.close();
//         }}
//         record={editRow.row}
//         setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
//         open={newRecordModal.isOpen || editRow.isOpen}
//       />
//       <ConfirmModal
//         title={"Are you sure you want to delete?"}
//         description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
//         a! Nihil`}
//         meta={confirmModal.meta}
//         onConfirm={handleDelete}
//         isLoading={confirmModal.isLoading}
//         open={confirmModal.isOpen}
//         onClose={() => confirmModal.close()}
//       />

//       <ApproveOrRejectModal
//         request={requestToApprove || requestToReject}
//         type={requestToApprove ? "approve" : requestToReject ? "reject" : null}
//         open={!!requestToApprove || !!requestToReject}
//         setOpen={(e) => {
//           if (!e) {
//             setrequestToApprove(null);
//             setrequestToReject(null);
//           }
//         }}
//         onCompleted={() => {
//           recordsQuery.refetch();
//         }}
//       />
//     </>
//   );
// }

// const formSchema = z.object({
//   reason: z.string().min(1, { message: "Please enter a reason" }),
// });

// function ApproveOrRejectModal({ type, open, setOpen, request, onCompleted }) {
//   const form = useForm<z.infer<typeof formSchema>>({
//     resolver: zodResolver(formSchema),
//     defaultValues: {
//       reason: "",
//     },
//   });

//   const { user } = useAuth();

//   const onSubmit = async (values) => {
//     try {
//       await pocketbase.collection("petty_cash_requests").update(request.id, {
//         status: type === "approve" ? "approved" : "rejected",
//         [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
//         [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
//         [type === "approve" ? "approved_reason" : "rejected_reason"]:
//           values.reason,
//       });

//       if (type === "approve") {
//         const account = await pocketbase
//           .collection("accounts")
//           .getOne(request.account);

//         const transaction = await pocketbase
//           .collection("accounts_transactions")
//           .create({
//             amount: request.amount,
//             date: request.created || new Date().toLocaleString(),
//             account: request.account,
//             request: request.id,
//             transactionType: "refill",
//             notes: request.notes,
//             balanceAfter: account.currentBalance + request.amount,
//           });

//         await pocketbase.collection("accounts").update(account.id, {
//           currentBalance: account?.currentBalance + request?.amount,
//         });

//         await pocketbase.collection("petty_cash_requests").update(request?.id, {
//           account_transaction: transaction?.id,
//         });
//       }

//       setOpen(false);
//       toast.success(
//         `Request ${type === "approve" ? "approved" : "rejected"} succesfully`
//       );
//       onCompleted();
//       form.reset();
//     } catch (error) {
//       toast.error(error.message);
//     }
//   };

//   return (
//     <Dialog open={open} onOpenChange={setOpen}>
//       <DialogContent className="sm:max-w-[450px]">
//         <DialogHeader>
//           <DialogTitle>
//             <span className="text-base px-1 font-semibold py-2">
//               {type === "approve" ? "Approve request." : "Reject request"}
//             </span>
//           </DialogTitle>
//           <DialogDescription>
//             <span className="px-1 py-0 text-sm text-slate-500 leading-7">
//               Fill in the fields to {type === "approve" ? "approve" : "reject"}{" "}
//               a request.
//             </span>
//           </DialogDescription>
//         </DialogHeader>
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)}>
//             <div className="grid px-2 gap-2">
//               <div>
//                 <AppFormTextArea
//                   form={form}
//                   label={"Enter a reason"}
//                   placeholder={"Enter reason"}
//                   name={"reason"}
//                 />
//               </div>
//             </div>
//             <DialogFooter>
//               <div className="mt-6 flex items-center gap-2 px-2 pb-1">
//                 <Button
//                   type="submit"
//                   onClick={() => form.handleSubmit(onSubmit)}
//                   disabled={
//                     form.formState.disabled || form.formState.isSubmitting
//                   }
//                   className="w-full"
//                   size="sm"
//                 >
//                   {form.formState.isSubmitting && (
//                     <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
//                   )}
//                   {type === "approve" ? "Approve request." : "Reject request"}
//                 </Button>
//               </div>
//             </DialogFooter>
//           </form>
//         </Form>
//       </DialogContent>
//     </Dialog>
//   );
// }


import * as XLSX from 'xlsx';
import { useState } from 'react';
import { useQuery } from 'react-query';
import { ColumnDef, PaginationState } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { PlusCircle } from 'lucide-react';
import pocketbase from '@/lib/pocketbase';
import cleanObject from '@/utils/cleanObject';
import BreadCrumb from '@/components/breadcrumb';
import { Button } from '@/components/ui/button';
import useModalState from '@/hooks/useModalState';
import useEditRow from '@/hooks/use-edit-row';
import DataTable from '@/components/DataTable';
import DataTableColumnHeader from '@/components/datatable/DataTableColumnHeader';
import DataTableRowActions from '@/components/datatable/DataTableRowActions';
import ConfirmModal from '@/components/modals/ConfirmModal';
import useConfirmModal from '@/hooks/useConfirmModal';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/auth.context';
import AppFormTextArea from '@/components/forms/AppFormTextArea';
import Loader from '@/components/icons/Loader';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/utils';
import { useRoles } from '@/context/roles.context';
import formatFilter from '@/utils/formatFilter';
import { PettryCashRequestModal } from '@/components/modals/PettryCashRequestModal';
import { DatePicker } from '@/components/ui/date-picker'; // Assuming you have a DatePicker component

// Function to export data to Excel
const exportToExcel = (data, fileName) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};



export default function PettyCashRequests() {
  const { canPerform } = useRoles();
  const [requestToApprove, setRequestToApprove] = useState(null);
  const [requestToReject, setRequestToReject] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([{ id: 'created', desc: true }]);
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [activeTab, setActiveTab] = useState('pending');
  const [exportStartDate, setExportStartDate] = useState(null);
  const [exportEndDate, setExportEndDate] = useState(null);

  const recordsQuery = useQuery({
    queryKey: [
      'petty_cash_requests',
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
      const searchQ = searchText ? `employee.name~"${searchText}"` : '';
      const filters = formatFilter(columnFilters);
      const sorters = sorting.map((p) => `${p.desc ? '-' : '+'}${p.id}`).join(' && ');

      return pocketbase
        .collection('petty_cash_requests')
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`].filter((e) => e).join('&&'),
            sort: sorters,
            expand: `requested_by,account`,
          }),
        })
        .then((e) => ({
          items: e?.items?.map((e) => ({
            id: e.id,
            account: e?.expand?.account?.name,
            amount: e.amount,
            status: e.status,
            requested_by: e.expand?.requested_by?.name,
            created: new Date(e.created).toLocaleDateString('en-US', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
            original: e,
          })),
          totalPages: e.totalPages,
        }));
    },
    enabled: true,
  });

  const newRecordModal = useModalState();
  const editRow = useEditRow();
  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection('petty_cash_requests')
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success('Credit deleted successfully');
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const handleExport = () => {
    const filteredData = recordsQuery.data.items.filter((item) => {
      const itemDate = new Date(item.original.created);
      return (
        (!exportStartDate || itemDate >= exportStartDate) &&
        (!exportEndDate || itemDate <= exportEndDate)
      );
    });

    exportToExcel(filteredData, 'PettyCashRequests');
  };

  return (
    <>
      <div className="px-4">
        <div className="flex pb-2 items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-[17px] font-semibold capitalize tracking-tight">
              Petty Cash Requests
            </h2>
            <BreadCrumb
              items={[
                {
                  title: 'Petty Cash Requests',
                  link: '/dashboard',
                },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <DatePicker
              selected={exportStartDate}
              onChange={(date) => setExportStartDate(date)}
              placeholderText="Start Date"
            />
            <DatePicker
              selected={exportEndDate}
              onChange={(date) => setExportEndDate(date)}
              placeholderText="End Date"
            />
            <Button onClick={handleExport} size="sm">
              Export to Excel
            </Button>
            <Button onClick={() => newRecordModal.open()} size="sm">
              <PlusCircle size={16} className="mr-2" />
              <span>Request Petty Cash</span>
            </Button>
          </div>
        </div>
        <div className="bg-white scroller border-t border-l border-r rounded-t">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex px-2 items-center justify-start">
              {[
                { title: 'Pending Requests', name: 'pending' },
                { title: 'Approved Requests', name: 'approved' },
                { title: 'Rejected Requests', name: 'rejected' },
              ].map((e, i) => (
                <a
                  key={i}
                  className={cn(
                    'cursor-pointer px-6 capitalize text-center relative w-full text-slate-700 text-[13px] sm:text-sm py-3 font-medium',
                    {
                      'text-primary': activeTab === e.name,
                    }
                  )}
                  onClick={() => setActiveTab(e.name)}
                >
                  {activeTab === e.name && (
                    <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                  )}
                  <span>{e.title}</span>
                </a>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        <DataTable
          isFetching={recordsQuery.isFetching}
          defaultColumnVisibility={{}}
          isLoading={recordsQuery.status === 'loading'}
          data={recordsQuery?.data?.items || []}
          columns={[
            {
              id: 'select',
              header: ({ table }) => (
                <Checkbox
                  checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
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
              accessorKey: 'requested_by',
              header: ({ column }) => <DataTableColumnHeader column={column} title="Requested by" />,
              cell: ({ row }) => <div className="capitalize truncate">{row.getValue('requested_by') || '---'}</div>,
              filterFn: (__, _, value) => value,
              enableSorting: true,
              enableHiding: true,
            },
            {
              accessorKey: 'account',
              header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
              cell: ({ row }) => <div className="capitalize truncate">{row.getValue('account') || 'N.A'}</div>,
              enableSorting: false,
              enableHiding: true,
            },
            {
              accessorKey: 'amount',
              header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
              cell: ({ row }) => (
                <div className="capitalize truncate">{Number(row.getValue('amount')).toLocaleString()} FRW</div>
              ),
              filterFn: (__, _, value) => value,
              enableSorting: true,
              enableHiding: true,
            },
            {
              accessorKey: 'status',
              header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
              cell: ({ row }) => <div className="capitalize">{row.getValue('status')}</div>,
              filterFn: (__, _, value) => value,
              enableSorting: true,
              enableHiding: true,
            },
            {
              accessorKey: 'created',
              header: ({ column }) => <DataTableColumnHeader column={column} title="Created at" />,
              cell: ({ row }) => <div className="capitalize truncate">{row.getValue('created')}</div>,
              filterFn: (__, _, value) => value,
              enableSorting: true,
              enableHiding: true,
            },
            {
              id: 'actions',
              header: ({ column }) => <DataTableColumnHeader column={column} title="Actions" />,
              cell: ({ row }) => (
                <DataTableRowActions
                  actions={[
                    {
                      title: 'Approve request',
                      onClick: (e) => setRequestToApprove(e.original),
                      disabled:
                        row.original.status === 'approved' ||
                        row.original.status === 'rejected' ||
                        !canPerform('approve_or_reject_request'),
                    },
                    {
                      title: 'Reject request',
                      onClick: (e) => setRequestToReject(e.original),
                      disabled:
                        row.original.status === 'approved' ||
                        row.original.status === 'rejected' ||
                        !canPerform('approve_or_reject_request'),
                    },
                  ]}
                  row={row}
                />
              ),
            },
          ]}
          onSearch={(e) => setSearchText(e)}
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
              title: 'Requested by',
              loader: ({ search }) =>
                pocketbase
                  .collection('users')
                  .getFullList(cleanObject({ filter: search ? `name~"${search}"` : '' }))
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id }))),
              name: 'requested_by',
              type: 'async-options',
            },
            {
              title: 'Account',
              loader: ({ search }) =>
                pocketbase
                  .collection('accounts')
                  .getFullList(cleanObject({ filter: search ? `name~"${search}"` : '' }))
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id }))),
              name: 'account',
              type: 'async-options',
            },
            {
              title: 'Status',
              loader: ({ search }) => [
                { label: 'Pending', value: 'pending' },
                { label: 'Approved', value: 'approved' },
                { label: 'Rejected', value: 'rejected' },
              ],
              name: 'status',
              type: 'options',
            },
            {
              title: 'Created',
              loader: ({ search }) => [
                { label: 'Today', value: 'today' },
                { label: 'This week', value: 'week' },
                { label: 'This month', value: 'month' },
                { label: 'This year', value: 'year' },
              ],
              name: 'created',
              type: 'options',
            }
          ]}
        />
      </div>

      <PettryCashRequestModal
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
        title={'Are you sure you want to delete?'}
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />

      <ApproveOrRejectModal
        request={requestToApprove || requestToReject}
        type={requestToApprove ? 'approve' : requestToReject ? 'reject' : null}
        open={!!requestToApprove || !!requestToReject}
        setOpen={(e) => {
          if (!e) {
            setRequestToApprove(null);
            setRequestToReject(null);
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
  reason: z.string().min(1, { message: 'Please enter a reason' }),
});

function ApproveOrRejectModal({ type, open, setOpen, request, onCompleted }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: '',
    },
  });

  const { user } = useAuth();

  const onSubmit = async (values) => {
    try {
      await pocketbase.collection('petty_cash_requests').update(request.id, {
        status: type === 'approve' ? 'approved' : 'rejected',
        [type === 'approve' ? 'approved_by' : 'rejected_by']: user?.id,
        [type === 'approve' ? 'approved_at' : 'rejected_at']: new Date(),
        [type === 'approve' ? 'approved_reason' : 'rejected_reason']: values.reason,
      });

      if (type === 'approve') {
        const account = await pocketbase.collection('accounts').getOne(request.account);
        const transaction = await pocketbase.collection('accounts_transactions').create({
          amount: request.amount,
          date: request.created || new Date().toLocaleString(),
          account: request.account,
          request: request.id,
          transactionType: 'refill',
          notes: request.notes,
          balanceAfter: account.currentBalance + request.amount,
        });

        await pocketbase.collection('accounts').update(account.id, {
          currentBalance: account?.currentBalance + request?.amount,
        });

        await pocketbase.collection('petty_cash_requests').update(request?.id, {
          account_transaction: transaction?.id,
        });
      }

      setOpen(false);
      toast.success(`Request ${type === 'approve' ? 'approved' : 'rejected'} successfully`);
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
              {type === 'approve' ? 'Approve request' : 'Reject request'}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {type === 'approve' ? 'approve' : 'reject'} a request.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div>
                <AppFormTextArea
                  form={form}
                  label={'Enter a reason'}
                  placeholder={'Enter reason'}
                  name={'reason'}
                />
              </div>
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="submit"
                  onClick={() => form.handleSubmit(onSubmit)}
                  disabled={form.formState.disabled || form.formState.isSubmitting}
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {type === 'approve' ? 'Approve request' : 'Reject request'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
