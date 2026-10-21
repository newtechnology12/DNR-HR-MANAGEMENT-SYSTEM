/**
 * One journal entry: header, its balanced lines with every dimension (department, funding source, project,
 * budget line), where it came from, and its reversal if it was reversed.
 */
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { BookOpen, CheckCircle2, CornerUpLeft } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { imsApi, rwf, showDay } from "@/lib/ims";
import { JOURNAL_SOURCES, JOURNAL_STATUS, JOURNAL_TYPES, sourceLink } from "@/lib/ledger";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { cn } from "@/utils";

const RIBBON: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  posted: { label: "Posted", tone: "success" }, reversed: { label: "Reversed", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" },
};
const th = "whitespace-nowrap px-2.5 py-2";
const money = (n: number) => (n ? Math.round(n).toLocaleString("en-US") : "");

export default function JournalDetail() {
  const { journalId } = useParams();
  const q = useQuery(["gl-journal", journalId], async () => {
    const j: any = await pocketbase.collection("gl_journals").getOne(journalId!, { expand: "period,fiscal_year,created_by,posted_by,reversal_of,reversed_by" });
    const lines: any[] = await pocketbase.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"`, sort: "line_no", expand: "account,department,funding_source,project,budget_line,cost_centre" });
    return { j, lines };
  });
  const history = useQuery(["audit", "gl_journals", journalId], () => imsApi.audit({ collection: "gl_journals", record: journalId, perPage: 50 }), { enabled: Boolean(journalId) });

  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={BookOpen} title="Journal not found" text="It may not exist, or your role cannot see the general ledger." /></div>;
  const { j, lines } = q.data;
  const debit = lines.reduce((a, l) => a + l.debit, 0);
  const credit = lines.reduce((a, l) => a + l.credit, 0);
  const link = sourceLink(j.source_type, j.source_id);
  const doExport = (format: ExportFormat) => exportReport({
    title: `Journal ${j.number}`, subtitle: `${showDay(j.date)} · ${j.description}`, rows: lines, format, what: `gl_journal:${j.number}`, orientation: "landscape", fileName: j.number, totals: ["Debit", "Credit"],
    columns: [
      { header: "#", value: (l: any) => l.line_no, width: 4 },
      { header: "Account", value: (l: any) => l.expand?.account?.code || "", width: 9 }, { header: "Account name", value: (l: any) => l.expand?.account?.name || "", width: 28 },
      { header: "Description", value: (l: any) => l.description, width: 30 },
      { header: "Department", value: (l: any) => l.expand?.department?.name || "", width: 20 }, { header: "Funding", value: (l: any) => l.expand?.funding_source?.code || "", width: 9 },
      { header: "Project", value: (l: any) => l.expand?.project?.code || "", width: 9 }, { header: "Budget line", value: (l: any) => l.expand?.budget_line?.code || "", width: 14 },
      { header: "Debit", value: (l: any) => l.debit, format: "money" }, { header: "Credit", value: (l: any) => l.credit, format: "money" },
    ],
  });

  return (
    <DocumentPage chatter={<Chatter items={toChatter([], (history.data?.items || []) as any[])} />}>
      <ControlBar
        breadcrumbs={[{ title: "General ledger", link: "/dashboard/finance/journals" }, { title: "Journal entries", link: "/dashboard/finance/journals" }, { title: j.number }]}
        actions={<ExportMenu label="Export journal" permission={["export_ledger", "view_journals"]} onExport={doExport} />}
      />
      <Sheet ribbon={RIBBON[j.status]}>
        <SheetTitle kicker={`${JOURNAL_TYPES[j.journal_type] || j.journal_type} journal`} title={j.number} badges={<StatusBadge status={j.status} map={JOURNAL_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Date", value: showDay(j.date), hint: [j.expand?.period?.name, j.expand?.fiscal_year?.name || j.expand?.fiscal_year?.code].filter(Boolean).join(" · ") || undefined },
            { label: "Description", value: j.description },
            {
              label: "Source",
              value: link ? <Link className="font-medium text-primaryDark hover:underline" to={link}>{JOURNAL_SOURCES[j.source_type] || j.source_type} {j.source_number}</Link> : `${JOURNAL_SOURCES[j.source_type] || j.source_type || "—"} ${j.source_number || ""}`,
            },
          ]}
          right={[
            { label: "Posted", value: j.posted_at ? `${showDay(j.posted_at)} by ${j.expand?.posted_by?.name || j.expand?.created_by?.name || "the system"}` : "", hint: j.journal_type === "automatic" ? "Posted automatically by the module" : undefined },
            { label: "Reversal of", value: j.expand?.reversal_of ? <Link className="font-mono text-primaryDark hover:underline" to={`/dashboard/finance/journals/${j.reversal_of}`}>{j.expand.reversal_of.number}</Link> : "" },
            { label: "Reversed by", value: j.expand?.reversed_by ? <Link className="font-mono text-primaryDark hover:underline" to={`/dashboard/finance/journals/${j.reversed_by}`}>{j.expand.reversed_by.number}</Link> : "", hint: j.reversal_reason || undefined },
          ]}
        />
        <div className={cn("mb-3 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[12.5px]", debit === credit ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
          {debit === credit ? <CheckCircle2 size={14} /> : <CornerUpLeft size={14} />}
          {debit === credit ? `Balanced: ${lines.length} lines, debits = credits = ${rwf(debit)}` : `Not balanced: debits ${rwf(debit)}, credits ${rwf(credit)}`}
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="dnr-grid w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                <th className={cn(th, "w-8")}>#</th><th className={th}>Account</th><th className={th}>Description</th><th className={th}>Department</th><th className={th}>Funding / project</th><th className={th}>Budget line</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id} className={l.status === "reversed" ? "text-slate-500" : ""}>
                  <td className="px-2.5 py-1.5 tabular-nums text-slate-400">{l.line_no}</td>
                  <td className="px-2.5 py-1.5"><span className="font-mono font-semibold">{l.expand?.account?.code}</span> <span className="text-slate-700">{l.expand?.account?.name}</span></td>
                  <td className="max-w-[260px] truncate px-2.5 py-1.5 text-slate-600" title={l.description}>{l.description}</td>
                  <td className="px-2.5 py-1.5">{l.expand?.department?.name || "—"}</td>
                  <td className="px-2.5 py-1.5">{l.expand?.funding_source?.code || "—"}{l.expand?.project ? ` · ${l.expand.project.code}` : ""}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[11.5px]">{l.expand?.budget_line?.code || ""}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{money(l.debit)}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{money(l.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold"><td className="px-2.5 py-1.5" colSpan={6}>Total</td><td className="px-2.5 py-1.5 text-right tabular-nums">{money(debit)}</td><td className="px-2.5 py-1.5 text-right tabular-nums">{money(credit)}</td></tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-500">Lines for salaries are by department and funding source; payslip details stay in the payroll.</p>
      </Sheet>
    </DocumentPage>
  );
}
