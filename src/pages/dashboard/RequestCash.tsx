import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState, useEffect } from "react";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import BreadCrumb from "@/components/breadcrumb";
import CashRequestFormModal from "@/components/modals/RequestCashFormModel";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

export default function RequestCash() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [userRoles, setUserRoles] = useState([]); // Assuming you have a way to get user roles

  useEffect(() => {
    // Fetch all users
    pocketbase.collection("users").getFullList().then(setUsers);

    // Fetch all departments
    pocketbase.collection("departments").getFullList().then(setDepartments);

    // Fetch user roles (assuming you have a way to get user roles)
    // setUserRoles(["Finance", "Helpdesk"]); // Example roles
  }, []);

  const getUserNameById = (id) => {
    const user = users.find((user) => user.id === id);
    return user ? user.name : 'N/A';
  };

  const getDepartmentNameById = (id) => {
    const department = departments.find((dept) => dept.id === id);
    return department ? department.name : 'N/A';
  };

  const userHasRole = (role) => {
    return userRoles.includes(role);
  };

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
      accessorKey: "employeeName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employee Name" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("employeeName");
        return (
          <div className="w-[80px]- flex items-center gap-2">
            <Link
              to={""}
              className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
            >
              {typeof value === 'string' ? value : 'N/A'}
            </Link>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "department",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("department");
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
      accessorKey: "expenseCategory",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Expense Category" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("expenseCategory");
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
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total Amount" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("totalAmount");
        return (
          <div className="capitalize">
            {typeof value === 'number' ? value.toLocaleString() : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("date");
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
      accessorKey: "paymentMethod",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Payment Method" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("paymentMethod");
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
      accessorKey: "purpose",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("purpose");
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
      accessorKey: "momoNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Momo Number" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("momoNumber");
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
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("status");
        return (
          <div className={`capitalize ${value === 'Waiting to be approved' ? 'text-red-500' : ''}`}>
            {typeof value === 'string' ? value : 'N/A'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "preparedBy",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Initiated By" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("preparedBy");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'Waiting to be approved'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "verifiedBy",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Verified By" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("verifiedBy");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'Waiting to be approved'}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "approvedBy",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Approved By" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("approvedBy");
        return (
          <div className="capitalize">
            {typeof value === 'string' ? value : 'Waiting to be approved'}
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
              title: "Edit request",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "Delete request",
              onClick: (e) => {
                confirmModal.open({ meta: e });
              },
            },
            {
              title: "Approve request",
              onClick: (e) => {
                if (userHasRole('Finance') || userHasRole('Helpdesk')) {
                  approveRequest(e.original);
                } else {
                  toast.error("You do not have permission to approve this request");
                }
              },
            },
            {
              title: "Reject request",
              onClick: (e) => {
                if (userHasRole('Finance') || userHasRole('Helpdesk')) {
                  rejectRequest(e.original);
                } else {
                  toast.error("You do not have permission to reject this request");
                }
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
      id: "date",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "cashRequests",
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
      const searchQ = searchText ? `users.name~"${searchText}"` : "";
      const filters = columnFilters
        .map((e) => {
          return e.value.map((p) => `${e.id}="${p}"`).join(" || ");
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => {
          if (p.id === "employeeName") {
            return `${p.desc ? "-" : "+"}expand.users.name`;
          }
          if (p.id === "department") {
            return `${p.desc ? "-" : "+"}expand.users.department`;
          }
          if (p.id === "expenseCategory") {
            return `${p.desc ? "-" : "+"}expand.expenseCategory.name`;
          }
          return `${p.desc ? "-" : "+"}${p.id}`;
        })
        .join(",");

      return pocketbase
        .collection("cashRequests")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join(" && "),
            sort: sorters,
            expand: 'users,departments',
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((record) => {
              return {
                id: record.id,
                employeeName: getUserNameById(record.employeeName),
                department: getDepartmentNameById(record.department),
                expenseCategory: record.expenseCategory || 'N/A',
                totalAmount: Number(record.totalAmount) || 0,
                date: new Date(record.date).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                paymentMethod: record.paymentMethod || 'N/A',
                purpose: record.purpose || 'N/A',
                additionalInfo: record.additionalInfo || 'N/A',
                momoNumber: record.momoNumber || 'N/A',
                momoName: record.momoName || 'N/A',
                particularly: record.particularly || 'N/A',
                description: record.description || 'N/A',
                status: record.status || 'N/A',
                preparedBy: getUserNameById(record.preparedBy),
                verifiedBy: getUserNameById(record.verifiedBy) || 'not approved',
                approvedBy: getUserNameById(record.approvedBy)  || 'not approved',
                attachment: record.attachment || 'N/A',
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
      .collection("cashRequests")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Request deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const approveRequest = (record) => {
    const reason = prompt("Please enter the reason for approval:");
    if (reason) {
      pocketbase
        .collection("cashRequests")
        .update(record.id, { status: "approved", approvalReason: reason })
        .then(() => {
          recordsQuery.refetch();
          toast.success("Request approved successfully");
        })
        .catch((e) => {
          toast.error(e.message);
        });
    }
  };

  const rejectRequest = (record) => {
    const reason = prompt("Please enter the reason for rejection:");
    if (reason) {
      pocketbase
        .collection("cashRequests")
        .update(record.id, { status: "rejected", rejectionReason: reason })
        .then(() => {
          recordsQuery.refetch();
          toast.success("Request rejected successfully");
        })
        .catch((e) => {
          toast.error(e.message);
        });
    }
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(recordsQuery.data.items);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cash Requests");
    XLSX.writeFile(workbook, "CashRequests.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.autoTable({
      head: [['Employee Name', 'Department', 'Expense Category', 'Total Amount', 'Date', 'Payment Method', 'Description', 'Momo Number', 'Status', 'Prepared By', 'Verified By', 'Approved By']],
      body: recordsQuery.data.items.map(item => [
        item.employeeName,
        item.department,
        item.expenseCategory,
        item.totalAmount,
        item.date,
        item.paymentMethod,
        item.description,
        item.momoNumber,
        item.status,
        item.preparedBy,
        item.verifiedBy,
        item.approvedBy,
      ]),
    });
    doc.save("CashRequests.pdf");
  };

  return (
    <>
      <div className="px-4">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              All Cash Requests
            </h2>
            <BreadCrumb
              items={[{ title: "View Cash Requests", link: "/dashboard" }]}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={exportToExcel} size="sm">
              Export to Excel
            </Button>
            <Button onClick={exportToPDF} size="sm">
              Export to PDF
            </Button>
            <Button onClick={() => newRecordModal.open()} size="sm">
              <PlusCircle size={16} className="mr-2" />
              <span>Create new Request</span>
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
                { label: "pending", value: "pending" },
                { label: "approved", value: "approved" },
                { label: "rejected", value: "rejected" },
              ],
            },
            {
              title: "Date",
              name: "date",
              options: [
                { label: "Last Week", value: "last_week" },
                { label: "Last Month", value: "last_month" },
                { label: "Last Year", value: "last_year" },
              ],
            },
            {
              title: "Employee",
              name: "employeeName",
              options: users.map(user => ({ label: user.name, value: user.id })),
            },
            {
              title: "Department",
              name: "department",
              options: departments.map(dept => ({ label: dept.name, value: dept.id })),
            },
          ]}
        />
      </div>

      <CashRequestFormModal
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
    </>
  );
}