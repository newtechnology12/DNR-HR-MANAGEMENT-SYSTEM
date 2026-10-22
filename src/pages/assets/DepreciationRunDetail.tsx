/**
 * One month's depreciation: the charge per asset (grouped by category), per department and funding source, the
 * approval by the DAF and the GL journal it posted.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Ban, Clock, FileSpreadsheet, FileText, RefreshCw, Send, Sheet, TrendingDown } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { RUN_STATUS, assetsApi } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  KpiBand,
  MenuItem,
  MoreMenu,
  Num,
  Page,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtNumber,
  statusText,
} from "@/components/ims";

const LIST = "/dashboard/assets/depreciation";
const EXPORT_PERMISSION = ["export_assets", "view_fixed_assets", "run_depreciation", "approve_depreciation"];

type SheetRow = { kind: "group"; key: string; name: string; count: number; charge: number } | { kind: "line"; key: string; line: any };

export default function DepreciationRunDetail() {
  const { runId } = useParams();
  const navigate = useNavigate();
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
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={TrendingDown} text="This run is not available. It may not exist, or your role cannot see depreciation." action={<ButtonLink to={LIST}>Back to depreciation</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { run, lines } = q.data;
  const x = run.expand || {};
  const approval = x.approval;
  const shown = lines.filter((l) => l.status !== "cancelled");
  const editable = ["draft", "returned"].includes(run.status) && can("run_depreciation");
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const act = async (action: "recalculate" | "submit") => {
    setBusy(action);
    try {
      const r = await assetsApi.run(run.id, action);
      toast.success(action === "submit" ? `${run.number} sent to the Director of Finance for approval` : `${run.number} recalculated: ${fmtMoney(r.total)} for ${r.asset_count} assets`);
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
    title: `Depreciation ${run.period_label}`, subtitle: `${run.number} · ${statusText(RUN_STATUS[run.status], run.status)}`, rows: shown, format, what: `depreciation_run:${run.number}`, orientation: "landscape", fileName: run.number,
    totals: ["Cost", "Charge"],
    columns: [
      { header: "Tag", value: (l: any) => l.expand?.asset?.code || "", width: 14 }, { header: "Asset", value: (l: any) => l.expand?.asset?.name || "", width: 32 },
      { header: "Category", value: (l: any) => l.expand?.category?.name || "", width: 18 }, { header: "Department", value: (l: any) => l.expand?.department?.name || "", width: 20 },
      { header: "Funding", value: (l: any) => l.expand?.funding_source?.code || "", width: 8 }, { header: "Cost", value: (l: any) => l.cost, format: "money" },
      { header: "Accumulated before", value: (l: any) => l.accumulated_before, format: "money" }, { header: "Charge", value: (l: any) => l.charge, format: "money" },
      { header: "Accumulated after", value: (l: any) => l.accumulated_after, format: "money" }, { header: "Net book value", value: (l: any) => l.net_book_value, format: "money" },
    ],
  });
  const runExport = async (format: ExportFormat) => {
    try {
      await doExport(format);
    } catch (e: any) {
      toast.error(e?.message || "The export could not be prepared. Try again.");
    }
  };

  const canExport = can(EXPORT_PERMISSION);
  const more: MenuItem[] = [
    { label: "Export to Excel", icon: FileSpreadsheet, onSelect: () => runExport("xlsx"), hidden: !canExport },
    { label: "Export as PDF", icon: FileText, onSelect: () => runExport("pdf"), hidden: !canExport },
    { label: "Export as CSV", icon: Sheet, onSelect: () => runExport("csv"), hidden: !canExport },
    { label: "Cancel run", icon: Ban, danger: true, onSelect: () => setCancelling(true), hidden: !(["draft", "returned", "pending_approval"].includes(run.status) && can("run_depreciation")) },
  ];

  // The assets table: a subtotal row per category, then its lines.
  const sheet: SheetRow[] = groups.flatMap((g) => [
    { kind: "group" as const, key: `g-${g.name}`, name: g.name, count: g.lines.length, charge: g.lines.reduce((t, l) => t + l.charge, 0) },
    ...g.lines.map((l) => ({ kind: "line" as const, key: l.id, line: l })),
  ]);
  const chargedTotal = shown.filter((l) => l.status !== "skipped").reduce((t, l) => t + l.charge, 0);
  const assetColumns: Column<SheetRow>[] = [
    {
      key: "asset",
      header: "Asset",
      clamp: true,
      cell: (r) => (r.kind === "group" ? <span className="font-bold text-ims-text">{r.name} <span className="font-normal text-ims-muted">· {fmtNumber(r.count)}</span></span> : <span className="font-semibold">{r.line.expand?.asset?.name}</span>),
      sub: (r) => (r.kind === "line" ? <span className="whitespace-nowrap font-mono">{r.line.expand?.asset?.code}</span> : null),
    },
    {
      key: "department",
      header: "Department",
      className: "max-w-[220px]",
      cell: (r) => (r.kind === "line" ? r.line.expand?.department?.name || "—" : ""),
      sub: (r) => (r.kind === "line" && r.line.expand?.funding_source && r.line.expand.funding_source.code !== "MC" ? `Funded by ${r.line.expand.funding_source.code}` : null),
    },
    { key: "cost", header: "Cost (RWF)", numeric: true, cell: (r) => (r.kind === "line" ? <Num value={r.line.cost} /> : "") },
    { key: "before", header: "Accumulated before (RWF)", numeric: true, cell: (r) => (r.kind === "line" ? <Num value={r.line.accumulated_before} /> : "") },
    { key: "charge", header: "Charge (RWF)", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.kind === "group" ? r.charge : r.line.charge} /></span>, total: <Num value={chargedTotal} /> },
    { key: "nbv", header: "Net book value (RWF)", numeric: true, cell: (r) => (r.kind === "line" ? <Num value={r.line.net_book_value} /> : "") },
  ];
  const deptColumns: Column<any>[] = [
    { key: "department", header: "Department", cell: (r) => <span className="font-semibold">{r.department}</span> },
    { key: "funding", header: "Funding / project", cell: (r) => `${r.funding}${r.project ? ` · ${r.project}` : ""}` },
    { key: "count", header: "Assets", numeric: true, cell: (r) => <Num value={r.count} />, total: <Num value={byDept.reduce((t, r) => t + r.count, 0)} /> },
    { key: "charge", header: "Depreciation (RWF)", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.charge} /></span>, total: <Num value={byDept.reduce((t, r) => t + r.charge, 0)} /> },
  ];
  const categoryColumns: Column<any>[] = [
    { key: "name", header: "Category", cell: (c) => c.name },
    { key: "total", header: "Depreciation (RWF)", numeric: true, cell: (c) => <Num value={c.total} />, total: <Num value={(run.by_category || []).reduce((t: number, c: any) => t + (c.total || 0), 0)} /> },
  ];
  const journal = x.journal ? (
    can(["view_journals", "export_ledger", "approve_journals"]) ? (
      <Link className="whitespace-nowrap font-mono font-semibold text-ims-link hover:underline" to={`/dashboard/finance/journals/${run.journal}`}>{x.journal.number}</Link>
    ) : (
      <span className="whitespace-nowrap font-mono">{x.journal.number}</span>
    )
  ) : "Posted when approved";

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to depreciation", to: LIST }}
        number={run.number}
        type="Monthly depreciation"
        status={RUN_STATUS[run.status]?.label || run.status}
        statusNote={stepName ? `At “${stepName}”` : RUN_STATUS[run.status]?.note}
        title={run.period_label}
        facts={[
          x.prepared_by?.name ? { label: "Calculated by", value: x.prepared_by.name } : null,
          run.computed_at ? fmtDate(run.computed_at) : null,
          x.fiscal_year?.name ? { label: "Fiscal year", value: x.fiscal_year.name } : null,
          x.journal ? { label: "Journal", value: journal } : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {editable && <Button icon={RefreshCw} onClick={() => act("recalculate")} loading={busy === "recalculate"} disabled={Boolean(busy)}>Recalculate</Button>}
            {editable && <Button variant="primary" icon={Send} onClick={() => act("submit")} loading={busy === "submit"} disabled={Boolean(busy)}>Submit for approval</Button>}
            <DecisionButtons approval={approval} number={run.number} onDone={refresh} />
          </>
        }
      />

      {stepName && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Pending approval at step “{stepName}”. Nothing is posted to the general ledger until it is approved.</span>
        </p>
      )}
      {run.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {run.cancel_reason}
        </p>
      )}

      <KpiBand
        items={[
          { label: "Depreciation", value: fmtMoney(run.total), tone: run.status === "approved" ? "success" : "default", sub: run.status === "approved" ? "Posted" : "Not posted yet" },
          { label: "Assets", value: fmtNumber(run.asset_count), sub: `${fmtNumber(groups.length)} categor${groups.length === 1 ? "y" : "ies"}` },
          { label: "Cost of these assets", value: fmtMoney(shown.reduce((t, l) => t + (l.cost || 0), 0)) },
          { label: "Net book value after", value: fmtMoney(shown.reduce((t, l) => t + (l.net_book_value || 0), 0)), sub: `${fmtNumber(new Set(shown.map((l) => l.department)).size)} departments charged`, onClick: () => setTab("departments") },
        ]}
      />

      <Tabs
        label="Depreciation run sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "assets", label: "Assets", count: shown.length },
          { key: "departments", label: "By department" },
          { key: "details", label: "Details" },
          { key: "approvals", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "assets" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHeader title="Charge per asset" subtitle="Grouped by category, with the subtotal of each category on its first row." />
          </div>
          <DataTable
            columns={assetColumns}
            rows={sheet}
            rowKey={(r) => r.key}
            onRowClick={(r) => r.kind === "line" && navigate(`/dashboard/assets/register/${r.line.asset}`)}
            rowClassName={(r) => (r.kind === "group" ? "bg-ims-thead" : r.line.status === "skipped" ? "text-ims-faint line-through" : undefined)}
            minWidth={900}
            caption="Depreciation per asset"
            empty={<EmptyState compact icon={TrendingDown} text="No asset was depreciated in this run." />}
          />
        </Card>
      )}

      {tab === "departments" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHeader title="By department and funding source" subtitle="How the charge is posted: depreciation expense by department and funding source, against accumulated depreciation." />
          </div>
          <DataTable columns={deptColumns} rows={byDept} rowKey={(r) => `${r.department}${r.funding}${r.project}`} minWidth={560} caption="Depreciation by department" empty={<EmptyState compact text="Nothing to post." />} />
        </Card>
      )}

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Run" />
            <Details
              items={[
                { label: "Run", value: <span className="whitespace-nowrap font-mono">{run.number}</span> },
                { label: "Month", value: run.period_label },
                { label: "Fiscal year", value: x.fiscal_year?.name },
                { label: "Calculated by", value: x.prepared_by?.name, hint: run.computed_at ? fmtDate(run.computed_at) : undefined },
                { label: "Approval", value: approval ? approval.workflow_name : "Not submitted yet", hint: approval ? statusText(RUN_STATUS[run.status], run.status) : undefined },
                { label: "General ledger", value: journal, hint: run.posted_at ? `Posted ${fmtDate(run.posted_at)}` : undefined },
                ...(run.cancel_reason ? [{ label: "Cancelled because", value: run.cancel_reason, wide: true }] : []),
              ]}
            />
          </Card>
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-5">
              <CardHeader title="By category" />
            </div>
            <DataTable columns={categoryColumns} rows={run.by_category || []} rowKey={(c: any) => c.category} minWidth={300} caption="Depreciation by category" empty={<EmptyState compact text="No category." />} />
          </Card>
        </div>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={trail.actions} />}

      {tab === "activity" && <Activity actions={trail.actions} audit={trail.audit} loading={trail.loading} />}

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${run.number}?`}
        description="Nothing is posted, and the month can be calculated again."
        confirmLabel="Cancel run"
        danger
        reason={{ label: "Reason", min: 5, placeholder: "Why the run is cancelled" }}
        onConfirm={async (reason) => {
          try {
            await assetsApi.run(run.id, "cancel", { reason });
            toast.success(`${run.number} cancelled`);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Page>
  );
}

