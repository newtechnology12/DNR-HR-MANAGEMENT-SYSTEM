/**
 * One month's depreciation: the charge per asset (grouped by category), per department and funding source, the
 * approval by the DAF and the GL journal it posted.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { RefreshCw, Send, TrendingDown, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { RUN_STATUS, assetsApi, money } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ReasonDialog } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const STEPS = [{ key: "draft", label: "Calculated" }, { key: "pending_approval", label: "Approval" }, { key: "approved", label: "Posted" }];
const th = "whitespace-nowrap px-2.5 py-2";
const td = "whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums";

export default function DepreciationRunDetail() {
  const { runId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("assets");
  const [busy, setBusy] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);
  const q = useQuery(["depreciation-run", runId], async () => {
    const run: any = await pocketbase.collection("depreciation_runs").getOne(runId!, { expand: "prepared_by,approval,journal,fiscal_year" });
    const lines: any[] = await pocketbase.collection("depreciation_lines").getFullList({ filter: `run = "${run.id}"`, sort: "category", expand: "asset,category,department,funding_source,project" });
    return { run, lines };
  });
  const trail = useApprovalTrail("depreciation_run", "depreciation_runs", runId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={TrendingDown} title="Run not found" text="It may not exist, or your role cannot see depreciation." /></div>;
  const { run, lines } = q.data;
  const x = run.expand || {};
  const shown = lines.filter((l) => l.status !== "cancelled");
  const editable = ["draft", "returned"].includes(run.status) && can("run_depreciation");
  const act = async (action: "recalculate" | "submit") => {
    setBusy(action);
    try {
      const r = await assetsApi.run(run.id, action);
      toast.success(action === "submit" ? "Sent to the Director of Finance" : `Recalculated: RWF ${money(r.total)} for ${r.asset_count} assets`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const groups = Object.values(shown.reduce((g: Record<string, any>, l) => {
    const k = l.category;
    (g[k] = g[k] || { name: l.expand?.category?.name || "—", lines: [] as any[] }).lines.push(l);
    return g;
  }, {})) as { name: string; lines: any[] }[];
  const byDept = Object.values(shown.reduce((g: Record<string, any>, l) => {
    const k = `${l.department}|${l.funding_source}|${l.project}`;
    const r = g[k] || (g[k] = { department: l.expand?.department?.name || "—", funding: l.expand?.funding_source?.code || "—", project: l.expand?.project?.code || "", count: 0, charge: 0 });
    r.count++;
    r.charge += l.charge;
    return g;
  }, {})).sort((a: any, b: any) => b.charge - a.charge) as any[];
  const doExport = (format: ExportFormat) => exportReport({
    title: `Depreciation ${run.period_label}`, subtitle: `${run.number} · ${RUN_STATUS[run.status]?.label || run.status}`, rows: shown, format, what: `depreciation_run:${run.number}`, orientation: "landscape", fileName: run.number,
    totals: ["Cost", "Charge"],
    columns: [
      { header: "Tag", value: (l: any) => l.expand?.asset?.code || "", width: 14 }, { header: "Asset", value: (l: any) => l.expand?.asset?.name || "", width: 32 },
      { header: "Category", value: (l: any) => l.expand?.category?.name || "", width: 18 }, { header: "Department", value: (l: any) => l.expand?.department?.name || "", width: 20 },
      { header: "Funding", value: (l: any) => l.expand?.funding_source?.code || "", width: 8 }, { header: "Cost", value: (l: any) => l.cost, format: "money" },
      { header: "Accumulated before", value: (l: any) => l.accumulated_before, format: "money" }, { header: "Charge", value: (l: any) => l.charge, format: "money" },
      { header: "Accumulated after", value: (l: any) => l.accumulated_after, format: "money" }, { header: "Net book value", value: (l: any) => l.net_book_value, format: "money" },
    ],
  });
  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Depreciation", link: "/dashboard/assets/depreciation" }, { title: run.number }]}
        steps={STEPS}
        current={run.status === "returned" ? "draft" : ["cancelled", "rejected"].includes(run.status) ? "draft" : run.status}
        actions={
          <>
            {editable && <Button size="sm" onClick={() => act("submit")} disabled={Boolean(busy)}><Send size={14} /> Send for approval</Button>}
            {editable && <Button size="sm" variant="outline" onClick={() => act("recalculate")} disabled={Boolean(busy)}><RefreshCw size={14} /> Recalculate</Button>}
            <DecisionButtons approval={x.approval} number={run.number} onDone={refresh} />
            <ExportMenu label="Export" permission={["export_assets", "view_fixed_assets", "run_depreciation", "approve_depreciation"]} onExport={doExport} />
            {["draft", "returned", "pending_approval"].includes(run.status) && can("run_depreciation") && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={run.status === "approved" ? { label: "Posted", tone: "success" } : run.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : undefined}>
        <SheetTitle kicker="Monthly depreciation" title={run.period_label} badges={<StatusBadge status={run.status} map={RUN_STATUS} />} />
        <div className="mb-5 grid gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-3">
          <div><p className="text-[11.5px] text-slate-500">Depreciation</p><p className="text-[20px] font-semibold tabular-nums">RWF {money(run.total)}</p></div>
          <div><p className="text-[11.5px] text-slate-500">Assets</p><p className="text-[20px] font-semibold tabular-nums">{run.asset_count}</p></div>
          <div className="flex flex-wrap gap-1.5 self-center">{(run.by_category || []).map((c: any) => <span key={c.category} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[12px]">{c.name}: <b className="tabular-nums">{money(c.total)}</b></span>)}</div>
        </div>
        <FieldGrid
          left={[
            { label: "Run", value: run.number },
            { label: "Fiscal year", value: x.fiscal_year?.name },
            { label: "Calculated by", value: x.prepared_by?.name, hint: run.computed_at ? showDay(run.computed_at) : undefined },
          ]}
          right={[
            { label: "Approval", value: x.approval ? `${x.approval.workflow_name} — ${x.approval.status}` : "Not sent yet" },
            { label: "General ledger", value: x.journal ? (can(["view_journals", "export_ledger", "approve_journals"]) ? <Link className="font-mono text-primaryDark hover:underline" to={`/dashboard/finance/journals/${run.journal}`}>{x.journal.number}</Link> : x.journal.number) : "Posted when approved", hint: run.posted_at ? `posted ${showDay(run.posted_at)}` : undefined },
            { label: "Cancelled because", value: run.cancel_reason },
          ]}
        />
        <Notebook tabs={[{ key: "assets", label: "Assets", count: shown.length }, { key: "departments", label: "By department" }, { key: "approval", label: "Approval" }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "assets" && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="dnr-grid w-full min-w-[900px] text-[12.5px]">
                <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Asset</th><th className={th}>Department</th><th className={cn(th, "text-right")}>Cost</th><th className={cn(th, "text-right")}>Before</th><th className={cn(th, "text-right")}>Charge</th><th className={cn(th, "text-right")}>Net book value</th></tr></thead>
                {groups.map((g) => (
                  <tbody key={g.name} className="divide-y divide-slate-100">
                    <tr className="bg-slate-50/70"><td className="px-2.5 py-1.5 font-semibold" colSpan={4}>{g.name} <span className="font-normal text-slate-500">· {g.lines.length}</span></td><td className={cn(td, "font-semibold")}>{money(g.lines.reduce((t, l) => t + l.charge, 0))}</td><td /></tr>
                    {g.lines.map((l) => (
                      <tr key={l.id} className={l.status === "skipped" ? "text-slate-400 line-through" : ""}>
                        <td className="px-2.5 py-1.5"><Link to={`/dashboard/assets/register/${l.asset}`} className="hover:underline"><span className="font-mono text-[11.5px] text-slate-500">{l.expand?.asset?.code}</span> {l.expand?.asset?.name}</Link></td>
                        <td className="px-2.5 py-1.5">{l.expand?.department?.name || "—"}{l.expand?.funding_source && l.expand.funding_source.code !== "MC" ? <span className="ml-1 rounded bg-violet-50 px-1 font-mono text-[11px] text-violet-700">{l.expand.funding_source.code}</span> : null}</td>
                        <td className={td}>{money(l.cost)}</td>
                        <td className={td}>{money(l.accumulated_before)}</td>
                        <td className={cn(td, "font-semibold")}>{money(l.charge)}</td>
                        <td className={td}>{money(l.net_book_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-2.5 py-1.5" colSpan={4}>Total</td><td className={td}>{money(shown.filter((l) => l.status !== "skipped").reduce((t, l) => t + l.charge, 0))}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
          {tab === "departments" && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="dnr-grid w-full min-w-[560px] text-[12.5px]">
                <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Department</th><th className={th}>Funding / project</th><th className={cn(th, "text-right")}>Assets</th><th className={cn(th, "text-right")}>Depreciation</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{byDept.map((r) => <tr key={`${r.department}${r.funding}${r.project}`}><td className="px-2.5 py-1.5">{r.department}</td><td className="px-2.5 py-1.5">{r.funding}{r.project ? ` · ${r.project}` : ""}</td><td className={td}>{r.count}</td><td className={cn(td, "font-semibold")}>{money(r.charge)}</td></tr>)}</tbody>
              </table>
              <p className="px-3 py-2 text-[12px] text-slate-500">This is how the charge is posted in the GL: depreciation expense by department and funding source against accumulated depreciation.</p>
            </div>
          )}
          {tab === "approval" && <ApprovalTracker approval={x.approval} actions={trail.actions} />}
        </div>
      </Sheet>
      <ReasonDialog
        open={cancelling}
        title={`Cancel ${run.number}?`}
        description="Nothing is posted; the month can be calculated again."
        confirmLabel="Cancel run"
        min={5}
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => {
          try {
            await assetsApi.run(run.id, "cancel", { reason });
            toast.success(`${run.number} cancelled`);
            setCancelling(false);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </DocumentPage>
  );
}
