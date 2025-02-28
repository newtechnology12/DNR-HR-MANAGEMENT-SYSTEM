import { utils, writeFile } from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Export to Excel
export const exportToExcel = (data: any[], columns: any[], fileName: string) => {
  const header = columns.map((col) => col.header);
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = row[col.accessorKey];
      return typeof value === "object" ? JSON.stringify(value) : value;
    })
  );

  const worksheet = utils.aoa_to_sheet([header, ...rows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Sheet1");
  writeFile(workbook, `${fileName}.xlsx`);
};

// Export to PDF
export const exportToPdf = (data: any[], columns: any[], fileName: string) => {
  const header = columns.map((col) => col.header);
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = row[col.accessorKey];
      return typeof value === "object" ? JSON.stringify(value) : value;
    })
  );

  const doc = new jsPDF();
  (doc as any).autoTable({
    head: [header],
    body: rows,
  });
  doc.save(`${fileName}.pdf`);
};