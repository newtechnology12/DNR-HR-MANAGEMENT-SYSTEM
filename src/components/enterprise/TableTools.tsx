/**
 * Export (Excel / PDF / CSV) and Excel import buttons for any list, including the older pages that do not
 * use RecordTable: pass the rows to export (all pages, current filters) and, optionally, an import config.
 */
import ExportMenu from "./ExportMenu";
import { ImportButton, ImportConfig } from "./ExcelImport";
import { ExportColumn, exportReport } from "@/lib/exporter";

export interface TableExport<T = any> {
  title: string;
  fileName?: string;
  subtitle?: string;
  /** All rows matching the current filters (not only the visible page). */
  rows: () => Promise<T[]>;
  columns: ExportColumn<T>[];
  totals?: string[];
  orientation?: "portrait" | "landscape";
  /** Audit label, e.g. the collection name. */
  what?: string;
  permission?: string | string[];
}

export default function TableTools<T = any>({ exportConfig, importConfig, onImported }: { exportConfig?: TableExport<T>; importConfig?: ImportConfig; onImported?: () => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {importConfig && <ImportButton config={importConfig} onDone={onImported} />}
      {exportConfig && (
        <ExportMenu
          permission={exportConfig.permission}
          onExport={async (format) => {
            const rows = await exportConfig.rows();
            await exportReport({
              title: exportConfig.title, subtitle: exportConfig.subtitle, rows, format, columns: exportConfig.columns,
              fileName: exportConfig.fileName, totals: exportConfig.totals, orientation: exportConfig.orientation, what: exportConfig.what,
            });
          }}
        />
      )}
    </span>
  );
}
