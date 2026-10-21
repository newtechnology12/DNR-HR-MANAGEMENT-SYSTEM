/**
 * The count sheet: each asset with where it should be and who holds it; the counter marks it found, found
 * elsewhere, damaged or missing. Completing the count updates the register and reconciles it with the GL.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { COUNT_RESULTS, assetsApi, money } from "@/lib/assets";
import { imsApi, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import ExportMenu from "@/components/enterprise/ExportMenu";
import DocumentUploads from "@/components/enterprise/Attachments";
import { ReasonDialog } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const th = "whitespace-nowrap px-2.5 py-2";
const td = "whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums";
const RESULT_BUTTONS: [string, string, string][] = [["found", "Found", "border-emerald-300 bg-emerald-50 text-emerald-800"], ["found_elsewhere", "Elsewhere", "border-blue-300 bg-blue-50 text-blue-800"], ["damaged", "Damaged", "border-amber-300 bg-amber-50 text-amber-800"], ["missing", "Missing", "border-red-300 bg-red-50 text-red-800"]];

export default function AssetCountDetail() {
  const { countId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("sheet");
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);
  const [elsewhere, setElsewhere] = React.useState<any | null>(null);
  const [where, setWhere] = React.useState("");
  const q = useQuery(["asset-count", countId], async () => {
    const v: any = await pocketbase.collection("asset_verifications").getOne(countId!, { expand: "department,started_by,completed_by" });
    const lines: any[] = await pocketbase.collection("asset_verification_lines").getFullList({ filter: `verification = "${v.id}"`, expand: "asset,expected_custodian,expected_department,checked_by" });
    lines.sort((a, b) => String(a.expand?.asset?.code).localeCompare(String(b.expand?.asset?.code)));
    return { v, lines };
  });
  const history = useQuery(["audit", "asset_verifications", countId], () => imsApi.audit({ collection: "asset_verifications", record: countId, perPage: 40 }), { enabled: Boolean(countId) });
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={ClipboardCheck} title="Count not found" text="It may not exist, or your role cannot see it." /></div>;
  const { v, lines } = q.data;
  const open = v.status === "open";
  const counter = open && can("manage_fixed_assets");
  const counts = lines.reduce((m: Record<string, number>, l) => ({ ...m, [l.result]: (m[l.result] || 0) + 1 }), {});
  const shown = lines.filter((l) => (filter === "all" || l.result === filter) && (!search.trim() || `${l.expand?.asset?.code} ${l.expand?.asset?.name} ${l.expected_location}`.toLowerCase().includes(search.trim().toLowerCase())));
  const record = async (line: any, result: string, found_location = "") => {
    if (result === "found_elsewhere" && !found_location.trim()) {
      setWhere(line.found_location || "");
      setElsewhere(line);
      return;
    }
    setBusy(line.id);
    try {
      await assetsApi.countLine(line.id, { result, found_location, condition: result === "damaged" ? "damaged" : line.expand?.asset?.condition || "" });
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const complete = async () => {
    setBusy("complete");
    try {
      await assetsApi.count(v.id, "complete");
      toast.success("Count completed — the register is updated and reconciled with the GL");
      q.refetch();
      history.refetch();
      setTab("result");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const doExport = (format: ExportFormat) => exportReport({
    title: `Asset count sheet — ${v.title}`, subtitle: `${v.number} · ${showDay(v.as_of)}`, rows: lines, format, what: `asset_count:${v.number}`, orientation: "landscape", fileName: v.number,
    columns: [
      { header: "Tag", value: (l: any) => l.expand?.asset?.code || "", width: 14 }, { header: "Asset", value: (l: any) => l.expand?.asset?.name || "", width: 32 },
      { header: "Should be at", value: (l: any) => l.expected_location, width: 26 }, { header: "Held by", value: (l: any) => l.expand?.expected_custodian?.name || "", width: 20 },
      { header: "Result", value: (l: any) => COUNT_RESULTS[l.result]?.label || l.result, width: 12 }, { header: "Found at", value: (l: any) => l.found_location, width: 20 }, { header: "Notes", value: (l: any) => l.notes, width: 24 },
    ],
  });
  const rec = (v.reconciliation || []) as any[];
  const s = v.summary || {};
  return (
    <DocumentPage chatter={<Chatter items={toChatter([], (history.data?.items || []) as any[])} />}>
      <ControlBar
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Asset counts", link: "/dashboard/assets/counts" }, { title: v.number }]}
        steps={[{ key: "open", label: "Counting" }, { key: "completed", label: "Completed" }]}
        current={v.status === "completed" ? "completed" : "open"}
        actions={
          <>
            {counter && <Button size="sm" onClick={complete} disabled={Boolean(busy) || Boolean(counts.pending)}><CheckCircle2 size={14} /> Complete the count</Button>}
            <ExportMenu label="Count sheet" permission={["export_assets", "view_fixed_assets", "manage_fixed_assets"]} onExport={doExport} />
            {counter && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={v.status === "completed" ? { label: "Completed", tone: "success" } : v.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : undefined}>
        <SheetTitle kicker="Asset count" title={v.title} badges={<StatusBadge status={v.status} map={{ open: { label: "Counting", tone: "warning" }, completed: { label: "Completed", tone: "success" }, cancelled: { label: "Cancelled", tone: "neutral" } }} />} />
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-5">
          {[["Assets", lines.length, ""], ["Found", (counts.found || 0) + (counts.found_elsewhere || 0), "text-emerald-700"], ["Damaged", counts.damaged || 0, "text-amber-700"], ["Missing", counts.missing || 0, "text-red-700"], ["Not counted", counts.pending || 0, counts.pending ? "text-slate-900" : "text-slate-400"]].map(([l, n, c]) => (
            <div key={String(l)}><p className="text-[11.5px] text-slate-500">{l}</p><p className={cn("text-[20px] font-semibold tabular-nums", String(c))}>{n}</p></div>
          ))}
        </div>
        <FieldGrid
          left={[{ label: "Scope", value: [v.expand?.department?.name, v.location].filter(Boolean).join(" · ") || "Whole register" }, { label: "Count date", value: showDay(v.as_of) }, { label: "Notes", value: v.notes }]}
          right={[{ label: "Started by", value: v.expand?.started_by?.name, hint: showDay(v.created) }, { label: "Completed", value: v.completed_at ? `${showDay(v.completed_at)} by ${v.expand?.completed_by?.name || "—"}` : "" }]}
        />
        <Notebook tabs={[{ key: "sheet", label: "Count sheet", count: lines.length }, ...(v.status === "completed" ? [{ key: "result", label: "Result and reconciliation" }] : []), { key: "documents", label: "Documents", count: (v.attachments || []).length }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "sheet" && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input type="search" className="h-9 w-full rounded-md border border-slate-200 px-3 text-[13px] sm:w-72" placeholder="Tag, asset or location" value={search} onChange={(e) => setSearch(e.target.value)} />
                {["all", "pending", "found", "found_elsewhere", "damaged", "missing"].map((k) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={cn("h-8 rounded-full border px-3 text-[12px] font-medium", filter === k ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
                    {k === "all" ? "All" : COUNT_RESULTS[k].label} {k === "all" ? lines.length : counts[k] || 0}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="dnr-grid w-full min-w-[900px] text-[12.5px]">
                  <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Asset</th><th className={th}>Should be at</th><th className={th}>Held by</th><th className={th}>Result</th>{counter && <th className={th}>Record</th>}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map((l) => (
                      <tr key={l.id}>
                        <td className="px-2.5 py-1.5"><Link to={`/dashboard/assets/register/${l.asset}`} className="hover:underline"><span className="block font-mono text-[11.5px] text-slate-500">{l.expand?.asset?.code}</span><span className="block font-medium text-slate-900">{l.expand?.asset?.name}</span></Link></td>
                        <td className="px-2.5 py-1.5">{l.expected_location || "—"}<span className="block text-[11.5px] text-slate-500">{l.expand?.expected_department?.name}</span></td>
                        <td className="px-2.5 py-1.5">{l.expand?.expected_custodian?.name || "—"}</td>
                        <td className="px-2.5 py-1.5"><StatusBadge status={l.result} map={COUNT_RESULTS} />{l.found_location && <span className="block text-[11.5px] text-slate-500">at {l.found_location}</span>}{l.notes && <span className="block max-w-[220px] truncate text-[11.5px] text-slate-500" title={l.notes}>{l.notes}</span>}</td>
                        {counter && (
                          <td className="px-2.5 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {RESULT_BUTTONS.map(([k, label, cls]) => (
                                <button key={k} type="button" disabled={busy === l.id} onClick={() => record(l, k)} className={cn("h-7 rounded border px-2 text-[11.5px] font-medium transition-opacity disabled:opacity-50", l.result === k ? cls : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>{label}</button>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "result" && v.status === "completed" && (
            <div className="space-y-4">
              <p className="text-[13px] text-slate-700">{s.total} assets counted: {(s.found || 0) + (s.found_elsewhere || 0)} found ({s.found_elsewhere || 0} at another location, now updated), <b className={cn(s.missing && "text-red-700")}>{s.missing} missing</b> (cost RWF {money(s.missing_cost)}, book value RWF {money(s.missing_nbv)} — now marked lost; prepare a write-off), {s.damaged} damaged (book value RWF {money(s.damaged_nbv)}).</p>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="dnr-grid w-full min-w-[860px] text-[12.5px]">
                  <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Category</th><th className={cn(th, "text-right")}>Cost: register</th><th className={cn(th, "text-right")}>GL</th><th className={cn(th, "text-right")}>Difference</th><th className={cn(th, "text-right")}>Depreciation: register</th><th className={cn(th, "text-right")}>GL</th><th className={cn(th, "text-right")}>Difference</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rec.map((r) => (
                      <tr key={r.category}>
                        <td className="px-2.5 py-1.5">{r.category} <span className="font-mono text-[11px] text-slate-400">{r.asset_account}/{r.accumulated_account}</span></td>
                        <td className={td}>{money(r.register_cost)}</td><td className={td}>{money(r.gl_cost)}</td><td className={cn(td, r.cost_difference ? "font-semibold text-red-700" : "text-emerald-700")}>{money(r.cost_difference)}</td>
                        <td className={td}>{money(r.register_accumulated)}</td><td className={td}>{money(r.gl_accumulated)}</td><td className={cn(td, r.accumulated_difference ? "font-semibold text-red-700" : "text-emerald-700")}>{money(r.accumulated_difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 py-2 text-[12px] text-slate-500">Register against the general ledger on the count date. Any difference must be explained before the period is closed.</p>
              </div>
            </div>
          )}
          {tab === "documents" && <DocumentUploads collection="asset_verifications" record={v} canAdd={can("manage_fixed_assets")} canRemove={open && can("manage_fixed_assets")} onChange={() => q.refetch()} hint="Signed count sheets, photos of damaged assets, Internal Audit's observation note" />}
        </div>
      </Sheet>
      {elsewhere && (
        <Dialog open onOpenChange={(o) => !o && setElsewhere(null)}>
          <DialogContent className="max-w-sm bg-white">
            <DialogHeader>
              <DialogTitle>Where was it found?</DialogTitle>
              <DialogDescription>{elsewhere.expand?.asset?.code} {elsewhere.expand?.asset?.name} — expected at {elsewhere.expected_location || "no location"}. Its location is updated when the count is completed.</DialogDescription>
            </DialogHeader>
            <input autoFocus className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13.5px]" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. HQ 3rd floor, DSG office" />
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setElsewhere(null)}>Cancel</Button>
              <Button disabled={!where.trim()} onClick={() => { const l = elsewhere; setElsewhere(null); record(l, "found_elsewhere", where.trim()); }}>Record</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <ReasonDialog
        open={cancelling}
        title={`Cancel ${v.number}?`}
        description="The results recorded so far are not applied to the register."
        confirmLabel="Cancel count"
        min={5}
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => {
          try {
            await assetsApi.count(v.id, "cancel", { reason });
            toast.success(`${v.number} cancelled`);
            setCancelling(false);
            q.refetch();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </DocumentPage>
  );
}
