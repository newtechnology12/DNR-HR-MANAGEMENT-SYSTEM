/**
 * Fixed assets → Depreciation: one run a month, in order. The Accountant calculates it (missed months are caught
 * up), the Director of Finance approves it, and it is posted to the GL by department and funding source.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Calculator, TrendingDown } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { RUN_STATUS, assetsApi, money } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { Field, inputCls } from "@/components/portal/kit";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DepreciationRuns() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [calculating, setCalculating] = React.useState(false);
  const view = params.get("view") || "all";
  const views: RecordView[] = [
    { key: "all", label: "All", filter: 'status != "cancelled"' },
    { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
    { key: "posted", label: "Posted", filter: 'status = "approved"' },
    { key: "cancelled", label: "Cancelled", filter: 'status = "cancelled" || status = "rejected"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Depreciation"
        description="Monthly depreciation of the register: calculated by the Accountant, approved by the Director of Finance, then posted to the general ledger by department and funding source. Months are depreciated in order, one run each."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Depreciation", link: "/dashboard/assets/depreciation" }]}
        actions={can("run_depreciation") && <Button onClick={() => setCalculating(true)}><Calculator size={15} /> Calculate a month</Button>}
      />
      <RecordTable<any>
        collection="depreciation_runs"
        expand="prepared_by,journal"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "period_label"]}
        defaultSort="-year,-month"
        exportName="depreciation-runs"
        exportTitle="Depreciation runs"
        exportPermission={["export_assets", "view_fixed_assets", "run_depreciation", "approve_depreciation"]}
        onRowClick={(r) => navigate(`/dashboard/assets/depreciation/${r.id}`)}
        empty={{ icon: TrendingDown, title: "No depreciation yet", text: "The Accountant calculates the depreciation of each month once it has started." }}
        columns={[
          { key: "number", header: "Run", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "period", header: "Month", sortField: "month", csv: (r) => r.period_label, cell: (r) => <span className="whitespace-nowrap font-medium text-slate-900">{r.period_label}</span> },
          { key: "assets", header: "Assets", sortField: "asset_count", align: "right", format: "number", csv: (r) => r.asset_count, cell: (r) => <span className="tabular-nums text-slate-600">{r.asset_count}</span> },
          { key: "total", header: "Depreciation", sortField: "total", align: "right", format: "money", csv: (r) => r.total, cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{money(r.total)}</span> },
          { key: "journal", header: "Journal", csv: (r) => r.expand?.journal?.number || "", cell: (r) => <span className="font-mono text-[12px] text-slate-600">{r.expand?.journal?.number || "—"}</span> },
          { key: "by", header: "Calculated by", csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{r.expand?.prepared_by?.name}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => RUN_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={RUN_STATUS} /> },
        ]}
      />
      {calculating && <CalculateDialog onClose={() => setCalculating(false)} onDone={(id) => navigate(`/dashboard/assets/depreciation/${id}`)} />}
    </div>
  );
}

function CalculateDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const last = useQuery(["depreciation-last"], () => pocketbase.collection("depreciation_runs").getList(1, 1, { filter: 'status = "approved"', sort: "-year,-month" }).then((r) => r.items[0] as any));
  const now = new Date();
  const [ym, setYm] = React.useState("");
  React.useEffect(() => {
    if (ym || last.isLoading) return;
    const l = last.data;
    const k = l ? l.year * 12 + l.month : now.getFullYear() * 12 + now.getMonth();
    setYm(`${Math.floor(k / 12)}-${(k % 12) + 1}`);
  }, [last.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = Array.from({ length: 18 }, (_, i) => {
    const k = now.getFullYear() * 12 + now.getMonth() - i;
    return { value: `${Math.floor(k / 12)}-${(k % 12) + 1}`, label: `${MONTHS[k % 12]} ${Math.floor(k / 12)}` };
  });
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    const [y, m] = ym.split("-").map(Number);
    setBusy(true);
    try {
      const r = await assetsApi.computeRun(y, m);
      toast.success(`${r.number}: RWF ${money(r.total)} for ${r.asset_count} assets — check it, then send it to the DAF`);
      onDone(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Calculate depreciation</DialogTitle>
          <DialogDescription>Every asset in the register is depreciated for the month, by its category's method and life. Months missed since an asset was capitalised are caught up.</DialogDescription>
        </DialogHeader>
        <Field label="Month" hint={last.data ? `Last posted: ${last.data.period_label}` : "No month posted yet"}>
          <select className={inputCls} value={ym} onChange={(e) => setYm(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Field>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !ym} onClick={run}>{busy ? "Calculating…" : "Calculate"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
