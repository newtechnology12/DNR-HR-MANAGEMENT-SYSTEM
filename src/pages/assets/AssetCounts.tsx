/**
 * Fixed assets → Asset counts: periodic physical verification. The Store & Asset Officer starts a count (whole
 * register, a department or a location), records each asset as found, found elsewhere, damaged or missing, then
 * completes it: missing assets become lost and the register is reconciled with the GL.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ClipboardCheck, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { assetsApi } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, PageHeader } from "@/components/enterprise/ui";
import RecordTable from "@/components/enterprise/RecordTable";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const STATUS = { open: { label: "Counting", tone: "warning" as const }, completed: { label: "Completed", tone: "success" as const }, cancelled: { label: "Cancelled", tone: "neutral" as const } };

export default function AssetCounts() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [starting, setStarting] = React.useState(false);
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Asset counts"
        description="Physical verification of the register, floor by floor with the asset tags. Missing assets become lost (a write-off can then be prepared) and the register is reconciled with the general ledger."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Asset counts", link: "/dashboard/assets/counts" }]}
        actions={can("manage_fixed_assets") && <Button onClick={() => setStarting(true)}><Plus size={15} /> Start a count</Button>}
      />
      <RecordTable<any>
        collection="asset_verifications"
        expand="department,started_by,completed_by"
        searchFields={["number", "title", "location"]}
        defaultSort="-as_of"
        exportName="asset-counts"
        exportTitle="Asset counts"
        exportPermission={["export_assets", "view_fixed_assets"]}
        onRowClick={(r) => navigate(`/dashboard/assets/counts/${r.id}`)}
        empty={{ icon: ClipboardCheck, title: "No count yet", text: "The Store & Asset Officer starts a count; Internal Audit may observe it." }}
        columns={[
          { key: "number", header: "Count", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "title", header: "Title", sortField: "title", csv: (r) => r.title, cell: (r) => <span className="block min-w-[220px]"><span className="block font-medium text-slate-900">{r.title}</span><span className="block text-[12px] text-slate-500">{[r.expand?.department?.name, r.location].filter(Boolean).join(" · ") || "Whole register"}</span></span> },
          { key: "as_of", header: "Date", sortField: "as_of", format: "date", csv: (r) => showDay(r.as_of), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.as_of)}</span> },
          {
            key: "result", header: "Result", csv: (r) => (r.summary ? `${r.summary.total} counted, ${r.summary.missing} missing, ${r.summary.damaged} damaged` : ""),
            cell: (r) => r.summary ? (
              <span className="whitespace-nowrap text-[12.5px]">{r.summary.total} counted · <span className={cn(r.summary.missing && "font-semibold text-red-700")}>{r.summary.missing} missing</span> · {r.summary.damaged} damaged</span>
            ) : <span className="text-[12.5px] text-slate-400">in progress</span>,
          },
          { key: "by", header: "Counted by", csv: (r) => r.expand?.started_by?.name || "", cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{r.expand?.started_by?.name}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => STATUS[r.status as keyof typeof STATUS]?.label || r.status, cell: (r) => <Badge tone={STATUS[r.status as keyof typeof STATUS]?.tone || "neutral"}>{STATUS[r.status as keyof typeof STATUS]?.label || r.status}</Badge> },
        ]}
      />
      {starting && <StartDialog onClose={() => setStarting(false)} onDone={(id) => navigate(`/dashboard/assets/counts/${id}`)} />}
    </div>
  );
}

function StartDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const depts = useQuery(["departments-list"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  const [v, setV] = React.useState({ title: "", as_of: new Date().toISOString().slice(0, 10), department: "", location: "", notes: "" });
  const [busy, setBusy] = React.useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await assetsApi.startCount(v);
      toast.success(`${r.number} started — the count sheet lists every asset in scope`);
      onDone(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Start an asset count</DialogTitle>
          <DialogDescription>Every asset in the scope is put on the count sheet with where it should be and who should hold it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title" required><input className={inputCls} value={v.title} onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))} placeholder="e.g. Year-end count June 2027 — head office" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Count date" required><input type="date" className={inputCls} value={v.as_of} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setV((x) => ({ ...x, as_of: e.target.value }))} /></Field>
            <Field label="Department" hint="Empty: the whole register"><select className={inputCls} value={v.department} onChange={(e) => setV((x) => ({ ...x, department: e.target.value }))}><option value="">All departments</option>{((depts.data || []) as any[]).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          </div>
          <Field label="Location contains" hint="e.g. “2nd floor” to count one floor"><input className={inputCls} value={v.location} onChange={(e) => setV((x) => ({ ...x, location: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className={cn(textareaCls, "min-h-[60px]")} value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="Who counts, who observes" /></Field>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || v.title.trim().length < 5} onClick={start}>{busy ? "Starting…" : "Start the count"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
