

import React, { useState, useEffect } from 'react';
import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, FileText, Download, Filter } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useQuery,useInfiniteQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { PrepaymentFormModal } from "@/components/modals/PrepaymentFormModal";
import { addDays, format, parseISO } from "date-fns";
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
import { useRoles } from "@/context/roles.context";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from "xlsx";

export default function Prepayments() {
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState("");
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const handleDescriptionClick = (description) => {
    setSelectedDescription(description);
    setIsDescriptionModalOpen(true);
  };

  const DescriptionModal = () => (
    <Dialog open={isDescriptionModalOpen} onOpenChange={setIsDescriptionModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Description</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-wrap">{selectedDescription}</div>
      </DialogContent>
    </Dialog>
  );

  const { canPerform } = useRoles();

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
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
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Requested by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("created_by") || "---"}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "department",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("department")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("category") || "N.A"}
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "account",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Account" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("account") || "N.A"}
        </div>
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
          {Number(row.getValue("amount")).toLocaleString()} 
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "momoNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Momo" />
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
      accessorKey: 'approved_by',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Approved by" />,
      cell: ({ row }) => <div className="capitalize truncate">{row.getValue('approved_by') || '---'}</div>,
      filterFn: (__, _, value) => value,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: 'rejected_by',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rejected by" />,
      cell: ({ row }) => <div className="capitalize truncate">{row.getValue('rejected_by') || '---'}</div>,
      filterFn: (__, _, value) => value,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => (
        <Button
          variant="link"
          onClick={() => handleDescriptionClick(row.getValue("description"))}
          className="text-blue-500 hover:text-blue-700"
        >
          View Description
        </Button>
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
      cell: ({ row }) => {
        const fileName = row.getValue("attachment");
        const recordId = row.original.id;
        const collectionName = "prepayments";
        const pocketBaseUrl = "https://pocketbase-production-f0b0.up.railway.app";
        
        if (!fileName) {
          return <div className="text-gray-500">No attachment</div>;
        }
        
        const handleView = async () => {
          try {
            const fileUrl = `${pocketBaseUrl}/api/files/${collectionName}/${recordId}/${fileName}`;
            const response = await fetch(fileUrl, {
              headers: {
                // 'Authorization': `Bearer ${localStorage.getItem('pocketbase_auth')}`
              }
            });
            
            if (!response.ok) throw new Error("Failed to fetch file");
            
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, '_blank');
          } catch (error) {
            console.error("Error viewing file:", error);
            alert("Failed to open the file. Please try again.");
          }
        };
        
        const handleDownload = async () => {
          try {
            const fileUrl = `${pocketBaseUrl}/api/files/${collectionName}/${recordId}/${fileName}`;
            const response = await fetch(fileUrl, {
              headers: {
                // 'Authorization': `Bearer ${localStorage.getItem('pocketbase_auth')}`
              }
            });
            
            if (!response.ok) throw new Error("Failed to fetch file");
            
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = fileName; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
          } catch (error) {
            console.error("Error downloading file:", error);
            alert("Failed to download the file. Please try again.");
          }
        };
        
        return (
          <div className="flex gap-2">
            <button
              className="px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
              onClick={handleView}
            >
              View
            </button>
            <button
              className="px-2 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
              onClick={handleDownload}
            >
              Download
            </button>
          </div>
        );
      },
      filterFn: (row) => Boolean(row.getValue("attachment")),
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
              title: "Approve expense",
              onClick: (e) => {
                setloanToApprove(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected" ||
                !canPerform("approve_or_reject_expense"),
            },
            {
              title: "Reject expense",
              onClick: (e) => {
                setloanToReject(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected" ||
                !canPerform("approve_or_reject_expense"),
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
    pageSize: 5000 // Set to a high number to load all data,
  });
  const [activeTab, setactiveTab] = useState("pending");

  // Apply date range filter when the dates change
  useEffect(() => {
    handleDateRangeFilter();
  }, [dateRange.from, dateRange.to]);

  // Function to handle date range filter changes
  const handleDateRangeFilter = () => {
    if (dateRange.from || dateRange.to) {
      // Remove existing date filter if any
      const updatedFilters = columnFilters.filter((filter) => filter.id !== "created");
      
      // Add the new date filter
      if (dateRange.from) {
        updatedFilters.push({
          id: "created",
          value: {
            from: dateRange.from,
            to: dateRange.to || dateRange.from, // If no 'to' date, use 'from' date
          },
        });
      }
      
      // Update the column filters
      setColumnFilters(updatedFilters);
    } else {
      // Remove the date filter if no date range is selected
      setColumnFilters(columnFilters.filter((filter) => filter.id !== "created"));
    }
  };

  // Function to clear date range filter
  const clearDateRangeFilter = () => {
    setDateRange({ from: null, to: null });
    setColumnFilters(columnFilters.filter((filter) => filter.id !== "created"));
  };

  const recordsQuery = useQuery({


    queryKey: [
      "prepayments",
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
      let dateFilterQuery = "";
      
      
      // Build the date filter query
      const dateFilter = columnFilters.find(f => f.id === "created");
      if (dateFilter && dateFilter.value.from) {
        const fromDate = new Date(dateFilter.value.from);
        // Set time to start of day
        fromDate.setHours(0, 0, 0, 0);
        
        let toDate;
        if (dateFilter.value.to) {
          toDate = new Date(dateFilter.value.to);
          // Set time to end of day
          toDate.setHours(23, 59, 59, 999);
        } else {
          toDate = new Date(fromDate);
          toDate.setHours(23, 59, 59, 999);
        }
        
        dateFilterQuery = `created >= "${fromDate.toISOString()}" && created <= "${toDate.toISOString()}"`;
      }
      
      // Build other filters
      const otherFilters = columnFilters
        .filter(e => e.id !== "created")
        .map((e) => {
          return e.value
            .map((p) => `${e.id}="${p.id || p.value || p}"`)
            .join(" || ");
        })
        .join(" && ");
      
      // Combine all filters
      const combinedFilters = [searchQ, dateFilterQuery, otherFilters, `status="${activeTab}"`]
        .filter((e) => e)
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(",");

      return pocketbase
        .collection("prepayments")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: combinedFilters,
            sort: sorters,
            '$autoCancel': false,
            expand: `employee,created_by,transactions,employee.designation,departments,expenseCategory,account,employee.department,requested_by,approved_by,rejected_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e.expand?.employee?.name || "---",
                position: e.position || "---",
                category: e?.expand?.expenseCategory?.name || "---",
                account: e?.expand?.account?.name || "---",
                attachment: e.attachment || "---",
                momoNumber: e.momoNumber || "---",
                momoName: e.momoName || "---",
                amount: e.amount || "---",
                status: e.status || "---",
                reason: e.reason || "---",
                rejected_reason: e.rejected_reason || "---",
                description: e.description || "---",
                created_at: new Date(e.created).toLocaleDateString('en-US', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                }),
                requested_by: e.expand?.requested_by?.name || "---",
                approved_by: e.expand?.approved_by?.name || "---",
                rejected_by: e.expand.rejected_by?.name || "---",
                created_by: e.expand?.created_by?.name || "---",
                department: e.expand?.employee?.expand?.department?.name || "---",
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
        toast.success("Expense deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const generatePDF = (data) => {
    const doc = new jsPDF();
    
    // Add report title
    doc.setFontSize(16);
    doc.text("Prepayment Report", 14, 15);
    
    // Add date range if filtering
    if (dateRange.from || dateRange.to) {
      doc.setFontSize(10);
      const dateText = `Date Range: ${dateRange.from ? format(new Date(dateRange.from), 'MMM dd, yyyy') : ''} ${dateRange.to ? `to ${format(new Date(dateRange.to), 'MMM dd, yyyy')}` : ''}`;
      doc.text(dateText, 14, 22);
    }
    
    // Add status
    doc.setFontSize(10);
    doc.text(`Status: ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`, 14, dateRange.from || dateRange.to ? 29 : 22);
    
    // Add total amount
    const totalAmount = data.reduce((sum, item) => sum + Number(item.amount), 0);
    doc.text(`Total Amount: ${Number(totalAmount).toLocaleString()} FRW`, 14, dateRange.from || dateRange.to ? 36 : 29);
    
    const tableColumn = [
      "Requested by",
      "Department",
      "Category",
      "Account",
      "Amount",
      "Momo",
      "Momo Name",
      "Status",
      "Created at",
    ];
    
    const tableRows = data.map((item) => [
      item.created_by || "---",
      item.department || "---",
      item.category || "---",
      item.account || "---",
      `${Number(item.amount).toLocaleString()}`,
      item.momoNumber || "---",
      item.momoName || "---",
      item.status || "---",
      item.created || "---",
    ]);
    
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: dateRange.from || dateRange.to ? 42 : 35,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });
    
    doc.save(`prepayment_report_${activeTab}.pdf`);
  };

  const generateExcel = (data) => {
    // Create a title for the Excel file based on status and date range
    let title = `Prepayment Report - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;
    if (dateRange.from || dateRange.to) {
      title += ` (${dateRange.from ? format(new Date(dateRange.from), 'MMM dd, yyyy') : ''} ${dateRange.to ? `to ${format(new Date(dateRange.to), 'MMM dd, yyyy')}` : ''})`;
    }
    
    // Calculate total
    const totalAmount = data.reduce((sum, item) => sum + Number(item.amount), 0);
    
    // Create summary row for the Excel sheet
    const summaryData = [{
      'Requested by': '',
      'Department': '',
      'Category': '',
      'Account': '',
      'Amount': `Total: ${Number(totalAmount).toLocaleString()}`,
      'Momo': '',
      'Momo Name': '',
      'Description': '',
      'Status': '',
      'Rejected Reason': '',
      'Created at': '',
    }];
    
    // Prepare data for Excel export
    const worksheetData = data.map((item) => ({
      'Requested by': item.created_by || "---",
      'Department': item.department || "---",
      'Category': item.category || "---",
      'Account': item.account || "---",
      'Amount': `${Number(item.amount).toLocaleString()}`,
      'Momo': item.momoNumber || "---",
      'Momo Name': item.momoName || "---",
      'Description': item.description || "---",
      'Status': item.status || "---",
      'Rejected Reason': item.rejected_reason || "---",
      'Created at': item.created || "---",
    }));
    
    // Combine data and summary
    const allData = [...worksheetData, ...summaryData];
    
    const worksheet = XLSX.utils.json_to_sheet(allData);
    const workbook = XLSX.utils.book_new();
    
    // Add title to the Excel sheet
    XLSX.utils.sheet_add_aoa(worksheet, [[title]], { origin: 'A1' });
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Prepayments");
    
    XLSX.writeFile(workbook, `prepayment_report_${activeTab}.xlsx`);
  };

  const totalAmount = recordsQuery?.data?.items?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Staff Expense Request</h1>
              <BreadCrumb
                items={[
                  {
                    title: `Staff Expense Request`,
                    link: `/prepayments`,
                  },
                ]}
              />
            </div>
            <Button 
              className="bg-primary hover:bg-primary/90" 
              onClick={() => newRecordModal.open()}
            >
              <PlusCircle size={16} className="mr-2" />
              New Expense Request
            </Button>
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="p-4 border-b">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Date Range Filter */}
              <div className="flex items-center gap-2">
                <label htmlFor="fromDate" className="text-sm font-medium text-gray-700">
                  From:
                </label>
                <input
                  type="date"
                  id="fromDate"
                  value={dateRange.from || ""}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="border rounded-md p-1"
                />
                <label htmlFor="toDate" className="text-sm font-medium text-gray-700">
                  To:
                </label>
                <input
                  type="date"
                  id="toDate"
                  value={dateRange.to || ""}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="border rounded-md p-1"
                />
              </div>

              {/* Clear filter button - only show when a date filter is active */}
              {(dateRange.from || dateRange.to) && (
                <Button 
                  variant="outline"
                  onClick={clearDateRangeFilter}
                  className="flex items-center gap-2 h-8"
                  size="sm"
                >
                  Clear Date Filter
                </Button>
              )}
              
              {/* Active filter indicator */}
              {(dateRange.from || dateRange.to) && (
                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center">
                  <Filter size={14} className="mr-1" />
                  Date filter active: {dateRange.from ? format(new Date(dateRange.from), 'MMM dd, yyyy') : ''}
                  {dateRange.to ? ` to ${format(new Date(dateRange.to), 'MMM dd, yyyy')}` : ''}
                </div>
              )}

              <div className="ml-auto flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => generatePDF(recordsQuery?.data?.items || [])}
                  className="flex items-center gap-2"
                >
                  <FileText size={16} />
                  Export PDF
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => generateExcel(recordsQuery?.data?.items || [])}
                  className="flex items-center gap-2"
                >
                  <Download size={16} />
                  Export Excel
                </Button>
              </div>
            </div>
          </div>

          {/* Status Tabs */}
          <ScrollArea className="w-full whitespace-nowrap border-b">
            <div className="flex p-2">
              {[
                { title: "Pending Expenses", name: "pending", color: "text-yellow-600" },
                { title: "Approved Expenses", name: "approved", color: "text-green-600" },
                { title: "Rejected Expenses", name: "rejected", color: "text-red-600" }
              ].map((tab) => (
                <button
                  key={tab.name}
                  onClick={() => setactiveTab(tab.name)}
                  className={`
                    px-6 py-3 relative font-medium text-sm transition-colors
                    ${activeTab === tab.name 
                      ? `${tab.color} border-b-2 border-current` 
                      : 'text-gray-500 hover:text-gray-700'
                    }
                  `}
                >
                  {tab.title}
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Loading Indicator */}
        {recordsQuery.isFetching && (
          <div className="flex justify-center items-center mb-4">
            <div className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-md">
              <Loader className="h-5 w-5 animate-spin" />
              <span>Loading data...</span>
            </div>
          </div>
        )}

        {/* Total Amount Section */}
        <div className="bg-white rounded-lg shadow-sm mb-6 p-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {recordsQuery?.data?.items?.length || 0} expense(s) found
              {(dateRange.from || dateRange.to) && (
                <span> in selected date range</span>
              )}
            </div>
            <div className="text-lg font-semibold">
              Total Amount: {Number(totalAmount).toLocaleString()} FRW
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm">
          <DataTable
            isFetching={recordsQuery.isFetching}
            defaultColumnVisibility={{}}
            isLoading={recordsQuery.status === "loading"}
            data={recordsQuery?.data?.items || []}
            columns={columns}
            onSearch={(e) => setsearchText(e)}
            sorting={sorting}
            setSorting={setSorting}
            pageCount={recordsQuery?.data?.totalPages}
            setPagination={setPagination}
            pageIndex={pageIndex}
            pageSize={pageSize}
            setColumnFilters={setColumnFilters}
            columnFilters={columnFilters}
            className="border-none"
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
                name: "created_by",
                type: "async-options",
              },
              
              {
                title: "Date Range",
                name: "created_at",
                type: "date-range",
                from: dateRange.from,
                to: dateRange.to
              },
              {
                title: "Status",
                name: "status",
                type: "options",
                options: [
                  { label: "Pending", value: "pending" },
                  { label: "Approved", value: "approved" },
                  { label: "Rejected", value: "rejected" }
                ]
              },
              
              
            ]}
          />
        </div>
      </div>

      {/* Modals */}
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
        title="Are you sure you want to delete?"
        description="This action cannot be undone."
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

      {/* Description Modal */}
      <DescriptionModal />
    </div>
  );
}

// Form Schema for Approve/Reject Modal
const formSchema = z.object({
  reason: z.string().min(1, { message: "Please enter a reason" }),
});

// Approve/Reject Modal Component
function ApproveOrRejectModal({
  type,
  open,
  setOpen,
  loan: expense,
  onCompleted,
}) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { user } = useAuth();

  const onSubmit = async (values) => {
    try {
      await pocketbase.collection("prepayments").update(expense.id, {
        status: type === "approve" ? "approved" : "rejected",
        [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
        [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
        [type === "approve" ? "approved_reason" : "rejected_reason"]:
          values.reason, // Save the rejection reason
      });

      if (type === "approve") {
        const account = await pocketbase
          .collection("accounts")
          .getOne(expense.account);

        const transaction = await pocketbase
          .collection("accounts_transactions")
          .create({
            amount: expense.amount,
            date: expense.date || expense.created || new Date().toLocaleString(),
            account: expense.account,
            expense: expense.id,
            transactionType: "expense",
            notes: expense.notes,
            balanceAfter: account.currentBalance - expense.amount,
          });

        await pocketbase.collection("accounts").update(account.id, {
          currentBalance: account?.currentBalance - expense?.amount,
        });

        await pocketbase.collection("prepayments").update(expense?.id, {
          account_transaction: transaction?.id,
        });
      }

      setOpen(false);
      toast.success(
        `Expense ${type === "approve" ? "approved" : "rejected"} successfully`
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
              {type === "approve" ? "Approve expense" : "Reject expense"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {type === "approve" ? "approve" : "reject"} this expense.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <AppFormTextArea
                form={form}
                label="Enter a reason"
                placeholder="Enter reason"
                name="reason"
              />
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="submit"
                  disabled={form.formState.disabled || form.formState.isSubmitting}
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {type === "approve" ? "Approve expense" : "Reject expense"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}