/**
 * Report exporter used by every list and report: Excel (.xlsx), PDF and CSV with the organisation
 * header, report title, filters / period, who generated it and when. Every export is written to the
 * audit trail (who exported what). Libraries are loaded on demand to keep the app bundle small.
 */
import pocketbase from "@/lib/pocketbase";
import { BRAND } from "@/lib/brand";
import { imsApi } from "@/lib/ims";

export type ExportFormat = "xlsx" | "pdf" | "csv";
export type CellFormat = "text" | "money" | "number" | "date" | "datetime" | "percent";

export interface ExportColumn<T = any> {
  header: string;
  /** Plain value for the file (string or number). */
  value: (row: T) => string | number | null | undefined;
  format?: CellFormat;
  /** Relative width hint (characters). */
  width?: number;
}

export interface ExportOptions<T = any> {
  title: string;
  /** Period, filters or other context shown under the title, e.g. "FY 2026/27 · Department: Finance". */
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  format: ExportFormat;
  fileName?: string;
  /** Sum these columns (by header) in a totals row. */
  totals?: string[];
  orientation?: "portrait" | "landscape";
  /** Audit label for what was exported, e.g. "gl_accounts". */
  what?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fileStamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function display(v: unknown, format: CellFormat = "text"): string {
  if (v === null || v === undefined || v === "") return "";
  if (format === "money" || format === "number") return Math.round(Number(v) || 0).toLocaleString("en-US");
  if (format === "percent") return `${(Number(v) || 0).toFixed(1)}%`;
  if (format === "date" || format === "datetime") {
    const d = new Date(String(v).replace(" ", "T"));
    if (isNaN(d.getTime())) return String(v);
    return format === "date" ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(v);
}

function generatedBy() {
  const m: any = pocketbase.authStore.model;
  return m?.name || m?.email || "System";
}

export async function exportReport<T>(opts: ExportOptions<T>) {
  const name = `${opts.fileName || slug(opts.title)}-${fileStamp()}`;
  const meta = `Generated ${stamp()} by ${generatedBy()}`;
  const totals = opts.totals || [];
  const sums: Record<string, number> = {};
  for (const c of opts.columns) if (totals.includes(c.header)) sums[c.header] = opts.rows.reduce((a, r) => a + (Number(c.value(r)) || 0), 0);

  if (opts.format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      esc(`${BRAND.orgName} — ${opts.title}`),
      opts.subtitle ? esc(opts.subtitle) : "",
      esc(meta),
      "",
      opts.columns.map((c) => esc(c.header)).join(","),
      ...opts.rows.map((r) => opts.columns.map((c) => esc(c.value(r))).join(",")),
    ].filter((l, i) => i !== 1 || l);
    if (totals.length) lines.push(opts.columns.map((c, i) => esc(i === 0 ? "Total" : sums[c.header] ?? "")).join(","));
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
  } else if (opts.format === "xlsx") {
    const XLSX = await import("xlsx");
    const head = [[BRAND.orgName], [`${BRAND.product} — ${opts.title}`], ...(opts.subtitle ? [[opts.subtitle]] : []), [meta], []];
    const body = opts.rows.map((r) =>
      opts.columns.map((c) => {
        const v = c.value(r);
        if (c.format === "money" || c.format === "number" || c.format === "percent") return v === null || v === undefined || v === "" ? "" : Number(v) || 0;
        if (c.format === "date" || c.format === "datetime") return display(v, c.format);
        return v ?? "";
      })
    );
    const aoa = [...head, opts.columns.map((c) => c.header), ...body];
    if (totals.length) aoa.push(opts.columns.map((c, i) => (i === 0 ? "Total" : sums[c.header] ?? "")));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = opts.columns.map((c) => ({ wch: c.width || Math.min(Math.max(c.header.length + 2, 12), 48) }));
    // Thousands separators on numeric columns.
    const first = head.length + 1;
    opts.columns.forEach((c, ci) => {
      if (c.format !== "money" && c.format !== "number") return;
      for (let ri = first; ri < aoa.length; ri++) {
        const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (ws[ref] && typeof ws[ref].v === "number") ws[ref].z = "#,##0";
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, opts.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    XLSX.writeFile(wb, `${name}.xlsx`);
  } else {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const orientation = opts.orientation || (opts.columns.length > 6 ? "landscape" : "portrait");
    const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const header = () => {
      doc.setFillColor(15, 61, 46);
      doc.rect(0, 0, W, 54, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(BRAND.orgName, 32, 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`${BRAND.product} · ${BRAND.productLong}`, 32, 39);
      doc.text(BRAND.orgAddress, W - 32, 24, { align: "right" });
    };
    header();
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(opts.title, 32, 82);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    let y = 98;
    if (opts.subtitle) {
      doc.text(opts.subtitle, 32, y);
      y += 13;
    }
    doc.text(meta, 32, y);
    const right = opts.columns.map((c) => c.format === "money" || c.format === "number" || c.format === "percent");
    const bodyRows = opts.rows.map((r) => opts.columns.map((c) => display(c.value(r), c.format)));
    autoTable(doc, {
      startY: y + 12,
      head: [opts.columns.map((c) => c.header)],
      body: bodyRows,
      foot: totals.length ? [opts.columns.map((c, i) => (i === 0 ? "Total" : sums[c.header] !== undefined ? display(sums[c.header], c.format) : ""))] : undefined,
      theme: "striped",
      margin: { left: 32, right: 32, top: 70, bottom: 40 },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(right.map((isNum, i) => [i, isNum ? { halign: "right" } : {}])),
      didDrawPage: () => {
        if (doc.getNumberOfPages() > 1) header();
      },
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`${BRAND.orgShort} · ${opts.title} · ${meta}`, 32, H - 20);
      doc.text(`Page ${i} of ${pages}`, W - 32, H - 20, { align: "right" });
    }
    doc.save(`${name}.pdf`);
  }
  imsApi.logExport({ what: opts.what || slug(opts.title), format: opts.format, rows: opts.rows.length, filters: opts.subtitle });
}

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
