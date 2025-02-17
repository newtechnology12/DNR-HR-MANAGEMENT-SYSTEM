"use client";

import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import jsPDF from "jspdf";
// import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import pocketbase from "@/lib/pocketbase";
import DataTable from "@/components/DataTable";
import { ColumnDef } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";

// Define types for the component props
interface ReportGeneratorProps {
  requests: RequestData[];
}

interface RequestData {
  expand: {
    employee: { name: string };
    car: { registrationNumber: string };
    expenses: { amount: number }[];
  };
  startTime: string;
  endTime: string;
  purpose: string;
  status: string;
  initialKm: number;
  finalKm: number;
}

// Form data interface for type safety
interface FormData {
  startDate: string;
  endDate: string;
}

export function ReportGenerator({ requests: initialRequests }: ReportGeneratorProps) {
  const { register, handleSubmit } = useForm<FormData>();
  const [filteredRequests, setFilteredRequests] = useState<RequestData[]>(initialRequests);

  // Fetch filtered data
  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      const fetchedRequests = await pocketbase.collection("requests").getFullList({
        filter: `startTime >= '${data.startDate}' && startTime <= '${data.endDate}'`,
        expand: "employee,car,expenses",
      });
      const mappedRequests = fetchedRequests.map((request: any) => ({
        expand: {
          employee: { name: request.expand.employee.name },
          car: { registrationNumber: request.expand.car.registrationNumber },
          expenses: request.expand.expenses,
        },
        startTime: request.startTime,
        endTime: request.endTime,
        purpose: request.purpose,
        status: request.status,
        initialKm: request.initialKm,
        finalKm: request.finalKm,
      }));
      setFilteredRequests(mappedRequests);
    } catch (error) {
      console.error("Error fetching filtered requests:", error);
    }
  };

  // Define table columns
  const columns: ColumnDef<RequestData>[] = [
    {
      accessorKey: "expand.employee.name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    },
    {
      accessorKey: "expand.car.registrationNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Car" />,
    },
    {
      accessorKey: "startTime",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start Time" />,
    },
    {
      accessorKey: "endTime",
      header: ({ column }) => <DataTableColumnHeader column={column} title="End Time" />,
    },
    {
      accessorKey: "purpose",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Purpose" />,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    },
    {
      accessorKey: "totalKm",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total KM" />,
      cell: ({ row }) => row.original.finalKm - row.original.initialKm,
    },
    {
      accessorKey: "totalExpenses",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Expenses" />,
      cell: ({ row }) => row.original.expand.expenses.reduce((sum, expense) => sum + expense.amount, 0),
    },
  ];

  // Export to PDF
  // const exportToPDF = () => {
  //   const doc = new jsPDF();
  //   autoTable(doc, {
  //     head: [columns.map((column) => (typeof column.header === "function" ? column.header({ column }) : column.header) || "")],
  //     body: filteredRequests.map((request) =>
  //       columns.map((column) => {
  //         if (column.cell) {
  //           return column.cell({ row: { original: request } }) as string;
  //         }
  //         return column.accessorKey
  //           .split(".")
  //           .reduce((obj: any, key: string) => (obj ? obj[key] : ""), request);
  //       })
  //     ),
  //   });
  //   doc.save("car_usage_report.pdf");
  // };

  // Export to Excel
  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredRequests.map((request) => ({
        Employee: request.expand.employee.name,
        Car: request.expand.car.registrationNumber,
        "Start Time": request.startTime,
        "End Time": request.endTime,
        Purpose: request.purpose,
        Status: request.status,
        "Total KM": request.finalKm - request.initialKm,
        "Total Expenses": request.expand.expenses.reduce((sum, expense) => sum + expense.amount, 0),
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Car Usage Report");
    XLSX.writeFile(workbook, "car_usage_report.xlsx");
  };

  return (
    <div className="space-y-4">
      {/* Filter Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex space-x-4">
        <Input {...register("startDate")} type="date" required />
        <Input {...register("endDate")} type="date" required />
        <Button type="submit">Generate Report</Button>
      </form>

      {/* Data Table */}
      <DataTable
        data={filteredRequests}
        columns={columns}
        isLoading={false}
        isFetching={false}
        defaultColumnVisibility={{}}
        onSearch={() => {}}
        columnFilters={[]}
        setColumnFilters={() => {}}
        setSorting={() => {}}
        sorting={[]}
        setPagination={() => {}}
        pageIndex={0}
        pageSize={10}
        pageCount={1}
        facets={{}} // Added empty facets to fix the error
        Action={() => null}
      />

      {/* Export Buttons */}
      <div className="flex space-x-4">
        {/* <Button onClick={exportToPDF}>Export to PDF</Button> */}
        <Button onClick={exportToExcel}>Export to Excel</Button>
      </div>
    </div>
  );
}