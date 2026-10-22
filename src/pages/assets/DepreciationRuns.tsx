/**
 * Fixed assets → Depreciation: one run a month, in order. The Accountant calculates it (missed months are caught
 * up), the Director of Finance approves it, and it is posted to the GL by department and funding source.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Calculator, ExternalLink, TrendingDown } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { RUN_STATUS, assetsApi } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { WithPeople } from "@/components/enterprise/WithCell";
import { Button, DocNo, Field, Modal, Num, Page, PageHeader, Person, Select, fmtMoney, statusText } from "@/components/ims";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DepreciationRuns() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [calculating, setCalculating] = React.useState(false);
  const view = params.get("view") || "all";
  const views: RecordView[] = [
    { key: "all", label: "All runs", filter: 'status != "cancelled"' },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "posted", label: "Posted", filter: 'status = "approved"' },
    { key: "cancelled", label: "Rejected or cancelled", filter: 'status = "cancelled" || status = "rejected"' },
  ];
  const canRun = can("run_depreciation");
  const open = (r: any) => navigate(`/dashboard/assets/depreciation/${r.id}`);

  /** Who must act now: the approver while it is in approval, the Accountant while it is calculated or returned. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.expand?.approval?.pending_approvers} fallback={<Person name="Director of Finance" detail="To approve" />} />;
    if (r.status === "draft" || r.status === "returned") return <Person name={r.expand?.prepared_by?.name} detail="To check and submit" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Run", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    { key: "period", header: "Month", sortField: "month", nowrap: true, csv: (r) => r.period_label, cell: (r) => <span className="font-semibold">{r.period_label}</span> },
    { key: "assets", header: "Assets", sortField: "asset_count", align: "right", format: "number", csv: (r) => r.asset_count, cell: (r) => <Num value={r.asset_count} /> },
    { key: "total", header: "Depreciation (RWF)", sortField: "total", align: "right", sum: "total", format: "money", csv: (r) => r.total, cell: (r) => <span className="font-semibold text-ims-text"><Num value={r.total} /></span> },
    { key: "journal", header: "Journal", nowrap: true, csv: (r) => r.expand?.journal?.number || "", cell: (r) => (r.expand?.journal?.number ? <DocNo value={r.expand.journal.number} /> : <span className="text-ims-faint">—</span>) },
    { key: "by", header: "Calculated by", className: "max-w-[180px]", csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => <Person name={r.expand?.prepared_by?.name} /> },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(RUN_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={RUN_STATUS} /> },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Depreciation" }]}
        title="Depreciation"
        subtitle="One run a month, in order: calculated by the Accountant, approved by the Director of Finance, then posted."
        primary={canRun ? { label: "Calculate a month", icon: Calculator, onClick: () => setCalculating(true) } : undefined}
      />
      <RecordTable<any>
        collection="depreciation_runs"
        expand="prepared_by,journal,approval"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "period_label"]}
        searchPlaceholder="Search number or month"
        defaultSort="-year,-month"
        exportName="depreciation-runs"
        exportTitle="Depreciation runs"
        exportPermission={["export_assets", "view_fixed_assets", "run_depreciation", "approve_depreciation"]}
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: TrendingDown,
          title: "No depreciation yet",
          text: view === "pending" ? "No run is pending approval." : "No depreciation yet. The Accountant calculates each month once depreciation has started.",
          action: canRun && view === "all" ? <Button variant="primary" icon={Calculator} onClick={() => setCalculating(true)}>Calculate a month</Button> : undefined,
        }}
        columns={columns}
      />
      {calculating && <CalculateDialog onClose={() => setCalculating(false)} onDone={(id) => navigate(`/dashboard/assets/depreciation/${id}`)} />}
    </Page>
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
      toast.success(`${r.number} calculated: ${fmtMoney(r.total)} for ${r.asset_count} assets. Check it, then submit it to the DAF.`);
      onDone(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Calculate depreciation"
      description="Every asset in the register is depreciated for the month by its category's method and life. Months missed since an asset was capitalised are caught up."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={!ym}>Calculate</Button>
        </>
      }
    >
      <Field label="Month" required htmlFor="dep-month" hint={last.data ? `Last posted: ${last.data.period_label}` : "No month posted yet"}>
        <Select id="dep-month" value={ym} onChange={(e) => setYm(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}
