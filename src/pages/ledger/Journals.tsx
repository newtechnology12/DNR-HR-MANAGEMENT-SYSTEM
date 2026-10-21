/**
 * Finance → Journal entries: every posting to the general ledger. Automatic journals come from the modules
 * (payroll and salary payments now); each is balanced and carries its source document. Posted journals are
 * never edited: a mistake is corrected by a reversal.
 */
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { JOURNAL_SOURCES, JOURNAL_STATUS, JOURNAL_TYPES, sourceLink } from "@/lib/ledger";
import { rwf, showDay } from "@/lib/ims";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";

export default function Journals() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "posted", label: "Posted", filter: 'status = "posted"' },
    { key: "automatic", label: "Automatic", filter: 'journal_type = "automatic"' },
    { key: "reversals", label: "Reversed & reversals", filter: 'status = "reversed" || journal_type = "reversal"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Journal entries"
        description="Every posting to the general ledger, balanced and linked to the document that caused it. Posted journals are never changed — a mistake is corrected by a reversal."
        breadcrumbs={[{ title: "General ledger", link: "/dashboard/finance/journals" }, { title: "Journal entries", link: "/dashboard/finance/journals" }]}
      />
      <RecordTable<any>
        collection="gl_journals"
        expand="period,created_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "description", "source_number"]}
        filters={[
          { field: "source_type", label: "Source", options: Object.entries(JOURNAL_SOURCES).map(([value, label]) => ({ value, label })) },
          { field: "journal_type", label: "Type", options: Object.entries(JOURNAL_TYPES).map(([value, label]) => ({ value, label })) },
          { field: "period", label: "Period", collection: "fiscal_periods", optionLabel: (p) => p.name || p.code, optionFilter: 'status != ""' },
        ]}
        dateField="date"
        dateLabel="Date"
        defaultSort="-date"
        exportName="journal-entries"
        exportTitle="Journal entries"
        exportPermission={["export_ledger", "view_journals"]}
        onRowClick={(r) => navigate(`/dashboard/finance/journals/${r.id}`)}
        empty={{ icon: BookOpen, title: "No journal entries", text: "Journals are posted automatically when a payroll is approved and paid; vouchers, receipts and depreciation follow." }}
        columns={[
          { key: "number", header: "Journal", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "date", header: "Date", sortField: "date", format: "date", csv: (r) => showDay(r.date), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.date)}<span className="block text-[11.5px] text-slate-400">{r.expand?.period?.name}</span></span> },
          {
            key: "description", header: "Description", sortField: "description", csv: (r) => r.description,
            cell: (r) => (
              <span className="block min-w-[240px]">
                <span className="block max-w-[420px] truncate font-medium text-slate-900">{r.description}</span>
                <span className="block text-[12px] text-slate-500">
                  {JOURNAL_SOURCES[r.source_type] || r.source_type || "—"}
                  {r.source_number && (sourceLink(r.source_type, r.source_id)
                    ? <> · <Link onClick={(e) => e.stopPropagation()} className="font-mono text-primaryDark hover:underline" to={sourceLink(r.source_type, r.source_id)}>{r.source_number}</Link></>
                    : <> · <span className="font-mono">{r.source_number}</span></>)}
                </span>
              </span>
            ),
          },
          { key: "source", header: "Source document", exportOnly: true, csv: (r) => `${JOURNAL_SOURCES[r.source_type] || r.source_type} ${r.source_number || ""}`.trim(), cell: () => null },
          { key: "type", header: "Type", sortField: "journal_type", csv: (r) => JOURNAL_TYPES[r.journal_type] || r.journal_type, cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{JOURNAL_TYPES[r.journal_type] || r.journal_type}</span> },
          { key: "lines", header: "Lines", sortField: "line_count", align: "right", format: "number", csv: (r) => r.line_count, cell: (r) => <span className="tabular-nums text-slate-600">{r.line_count}</span> },
          { key: "amount", header: "Amount", sortField: "total_debit", align: "right", format: "money", csv: (r) => r.total_debit, cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.total_debit)}</span> },
          { key: "by", header: "Posted by", exportOnly: true, csv: (r) => r.expand?.created_by?.name || "System", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => JOURNAL_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={JOURNAL_STATUS} /> },
        ]}
      />
    </div>
  );
}
