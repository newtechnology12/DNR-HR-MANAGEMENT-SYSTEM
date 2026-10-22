/**
 * The count sheet: each asset with where it should be and who holds it; the counter marks it found, found
 * elsewhere, damaged or missing. Completing the count updates the register and reconciles it with the GL.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Ban, CheckCircle2, ClipboardCheck, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { COUNT_RESULTS, assetsApi } from "@/lib/assets";
import type { Tone } from "@/lib/procurement";
import { imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "@/components/enterprise/Approval";
import DocumentUploads from "@/components/enterprise/Attachments";
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
  Field,
  FilterBar,
  FilterSelect,
  Input,
  KpiBand,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  PILL_TONE,
  Page,
  Pill,
  PillTone,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtNumber,
  statusText,
} from "@/components/ims";
import { cn } from "@/utils";

const LIST = "/dashboard/assets/counts";
const EXPORT_PERMISSION = ["export_assets", "view_fixed_assets", "manage_fixed_assets"];
/** A count is a document: counting is "In progress", then "Completed" (or "Cancelled"). */
const COUNT_STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  open: { label: "In progress", tone: "info", note: "Counting" },
  completed: { label: "Completed", tone: "success", note: "Register updated" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
/** Count results are tags, not statuses: each keeps its colour. */
const RESULT_TONE: Record<string, PillTone> = { neutral: "neutral", success: "success", info: "info", warning: "warning", danger: "danger", violet: "orange" };
const toneOf = (result?: string) => RESULT_TONE[COUNT_RESULTS[result || ""]?.tone || "neutral"];
const RESULT_BUTTONS: [string, string][] = [["found", "Found"], ["found_elsewhere", "Elsewhere"], ["damaged", "Damaged"], ["missing", "Missing"]];

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
          <EmptyState icon={ClipboardCheck} text="This count is not available. It may not exist, or your role cannot see it." action={<ButtonLink to={LIST}>Back to asset counts</ButtonLink>} />
        </Card>
      </Page>
    );
  }
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
      toast.success(`${v.number} completed. The register is updated and reconciled with the general ledger.`);
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
    title: `Asset count sheet — ${v.title}`, subtitle: `${v.number} · ${fmtDate(v.as_of)}`, rows: lines, format, what: `asset_count:${v.number}`, orientation: "landscape", fileName: v.number,
    columns: [
      { header: "Tag", value: (l: any) => l.expand?.asset?.code || "", width: 14 }, { header: "Asset", value: (l: any) => l.expand?.asset?.name || "", width: 32 },
      { header: "Should be at", value: (l: any) => l.expected_location, width: 26 }, { header: "Held by", value: (l: any) => l.expand?.expected_custodian?.name || "", width: 20 },
      { header: "Result", value: (l: any) => COUNT_RESULTS[l.result]?.label || l.result, width: 12 }, { header: "Found at", value: (l: any) => l.found_location, width: 20 }, { header: "Notes", value: (l: any) => l.notes, width: 24 },
    ],
  });
  const runExport = async (format: ExportFormat) => {
    try {
      await doExport(format);
    } catch (e: any) {
      toast.error(e?.message || "The count sheet could not be prepared. Try again.");
    }
  };
  const rec = (v.reconciliation || []) as any[];
  const s = v.summary || {};
  const canExport = can(EXPORT_PERMISSION);
  const more: MenuItem[] = [
    { label: "Count sheet in Excel", icon: FileSpreadsheet, onSelect: () => runExport("xlsx"), hidden: !canExport },
    { label: "Count sheet as PDF", icon: FileText, onSelect: () => runExport("pdf"), hidden: !canExport },
    { label: "Count sheet as CSV", icon: Sheet, onSelect: () => runExport("csv"), hidden: !canExport },
    { label: "Cancel count", icon: Ban, danger: true, onSelect: () => setCancelling(true), hidden: !counter },
  ];
  const showResult = (k: string) => {
    setTab("sheet");
    setFilter(k);
  };

  const sheetColumns: Column<any>[] = [
    {
      key: "asset",
      header: "Asset",
      clamp: true,
      cell: (l) => <Link to={`/dashboard/assets/register/${l.asset}`} className="font-semibold text-ims-text hover:text-ims-link hover:underline">{l.expand?.asset?.name}</Link>,
      sub: (l) => <span className="whitespace-nowrap font-mono">{l.expand?.asset?.code}</span>,
    },
    { key: "where", header: "Should be at", className: "max-w-[240px]", cell: (l) => l.expected_location || <span className="text-ims-faint">—</span>, sub: (l) => l.expand?.expected_department?.name },
    { key: "holder", header: "Held by", className: "max-w-[180px]", cell: (l) => (l.expand?.expected_custodian?.name ? <span className="block truncate">{l.expand.expected_custodian.name}</span> : <span className="text-ims-faint">—</span>) },
    {
      key: "result",
      header: "Result",
      cell: (l) => <Pill tone={toneOf(l.result)}>{COUNT_RESULTS[l.result]?.label || l.result}</Pill>,
      sub: (l) =>
        l.found_location || l.notes ? (
          <span className="block max-w-[220px]">
            {l.found_location && <span className="block">At {l.found_location}</span>}
            {l.notes && <span className="block truncate" title={l.notes}>{l.notes}</span>}
          </span>
        ) : null,
    },
    ...(counter
      ? [
          {
            key: "record",
            header: "Record",
            cell: (l: any) => (
              <div className="flex flex-wrap gap-1" role="group" aria-label={`Count result for ${l.expand?.asset?.code}`}>
                {RESULT_BUTTONS.map(([k, label]) => {
                  const on = l.result === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      disabled={busy === l.id}
                      onClick={() => record(l, k)}
                      className={cn(
                        "h-[30px] rounded-control border px-2.5 text-t-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus disabled:opacity-50",
                        on ? cn(PILL_TONE[toneOf(k)], "border-transparent") : "border-ims-field bg-ims-card text-ims-body hover:bg-ims-subtle"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ),
          } as Column<any>,
        ]
      : []),
  ];

  const diff = (n: number) => <span className={cn("font-semibold", n ? "text-ims-danger" : "text-ims-success")}><Num value={n} /></span>;
  const sum = (k: string) => rec.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const recColumns: Column<any>[] = [
    { key: "category", header: "Category", cell: (r) => <span className="font-semibold">{r.category}</span>, sub: (r) => <span className="font-mono">{r.asset_account}/{r.accumulated_account}</span> },
    { key: "register_cost", header: "Cost in register (RWF)", numeric: true, cell: (r) => <Num value={r.register_cost} />, total: <Num value={sum("register_cost")} /> },
    { key: "gl_cost", header: "Cost in GL (RWF)", numeric: true, cell: (r) => <Num value={r.gl_cost} />, total: <Num value={sum("gl_cost")} /> },
    { key: "cost_difference", header: "Difference (RWF)", numeric: true, cell: (r) => diff(r.cost_difference), total: diff(sum("cost_difference")) },
    { key: "register_accumulated", header: "Depreciation in register (RWF)", numeric: true, cell: (r) => <Num value={r.register_accumulated} />, total: <Num value={sum("register_accumulated")} /> },
    { key: "gl_accumulated", header: "Depreciation in GL (RWF)", numeric: true, cell: (r) => <Num value={r.gl_accumulated} />, total: <Num value={sum("gl_accumulated")} /> },
    { key: "accumulated_difference", header: "Difference (RWF)", numeric: true, cell: (r) => diff(r.accumulated_difference), total: diff(sum("accumulated_difference")) },
  ];

  const scope = [v.expand?.department?.name, v.location].filter(Boolean).join(" · ") || "Whole register";
  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to asset counts", to: LIST }}
        number={v.number}
        type="Asset count"
        status={COUNT_STATUS[v.status]?.label || v.status}
        statusNote={COUNT_STATUS[v.status]?.note}
        title={v.title}
        facts={[scope, { label: "Count date", value: fmtDate(v.as_of) }, v.expand?.started_by?.name ? { label: "Started by", value: v.expand.started_by.name } : null]}
        actions={
          <>
            <MoreMenu items={more} />
            {counter && (
              <Button variant="primary" icon={CheckCircle2} onClick={complete} loading={busy === "complete"} disabled={Boolean(busy) || Boolean(counts.pending)}>
                Complete the count
              </Button>
            )}
          </>
        }
      />

      {counter && counts.pending > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-link/25 bg-ims-info-bg px-4 py-3 text-t-body text-ims-info">
          <ClipboardCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{fmtNumber(counts.pending)} asset{counts.pending === 1 ? "" : "s"} still to count. Record a result for each one, then complete the count.</span>
        </p>
      )}
      {v.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {v.cancel_reason}
        </p>
      )}

      <KpiBand
        items={[
          { label: "Assets", value: fmtNumber(lines.length), onClick: () => showResult("all") },
          { label: "Found", value: fmtNumber((counts.found || 0) + (counts.found_elsewhere || 0)), sub: counts.found_elsewhere ? `${fmtNumber(counts.found_elsewhere)} elsewhere` : undefined, tone: "success", onClick: () => showResult("found") },
          { label: "Damaged", value: fmtNumber(counts.damaged || 0), tone: counts.damaged ? "warning" : "default", onClick: () => showResult("damaged") },
          { label: "Missing", value: fmtNumber(counts.missing || 0), tone: counts.missing ? "danger" : "default", onClick: () => showResult("missing") },
          { label: "Not counted", value: fmtNumber(counts.pending || 0), onClick: () => showResult("pending") },
        ]}
      />

      <Tabs
        label="Count sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "sheet", label: "Count sheet", count: lines.length },
          ...(v.status === "completed" ? [{ key: "result", label: "Result and reconciliation" }] : []),
          { key: "details", label: "Details" },
          { key: "documents", label: "Documents", count: (v.attachments || []).length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "sheet" && (
        <Card padded={false} className="overflow-hidden">
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: "Search tag, asset or location" }}
            chips={filter !== "all" ? [{ key: "result", label: `Result: ${COUNT_RESULTS[filter]?.label || filter}`, onRemove: () => setFilter("all") }] : []}
            onClear={() => setFilter("all")}
            right={<span className="text-t-small text-ims-muted">{fmtNumber(shown.length)} of {fmtNumber(lines.length)} assets</span>}
          >
            <FilterSelect
              label="Result"
              value={filter === "all" ? "" : filter}
              onChange={(x) => setFilter(x || "all")}
              options={["pending", "found", "found_elsewhere", "damaged", "missing"].map((k) => ({ value: k, label: `${COUNT_RESULTS[k].label} (${fmtNumber(counts[k] || 0)})` }))}
            />
          </FilterBar>
          <DataTable
            columns={sheetColumns}
            rows={shown}
            rowKey={(l) => l.id}
            minWidth={counter ? 980 : 760}
            caption="Count sheet"
            empty={<EmptyState compact icon={ClipboardCheck} text={search || filter !== "all" ? "No asset matches. Change the search or clear the filter." : "No asset in the scope of this count."} />}
          />
        </Card>
      )}

      {tab === "result" && v.status === "completed" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHeader title="Register against the general ledger" subtitle="On the count date. Any difference must be explained before the period is closed." />
            <p className="mb-4 text-t-body text-ims-body">
              {fmtNumber(s.total)} assets counted: {fmtNumber((s.found || 0) + (s.found_elsewhere || 0))} found ({fmtNumber(s.found_elsewhere || 0)} at another location, now updated),{" "}
              <b className={cn("font-semibold", s.missing && "text-ims-danger")}>{fmtNumber(s.missing)} missing</b> (cost {fmtMoney(s.missing_cost)}, book value {fmtMoney(s.missing_nbv)}, now marked lost: prepare a write-off), {fmtNumber(s.damaged)} damaged (book value {fmtMoney(s.damaged_nbv)}).
            </p>
          </div>
          <DataTable columns={recColumns} rows={rec} rowKey={(r) => r.category} minWidth={900} caption="Reconciliation of the register with the general ledger" empty={<EmptyState compact text="No reconciliation recorded." />} />
        </Card>
      )}

      {tab === "details" && (
        <Card>
          <CardHeader title="Count" />
          <Details
            columns={3}
            items={[
              { label: "Scope", value: scope },
              { label: "Count date", value: fmtDate(v.as_of) },
              { label: "Status", value: statusText(COUNT_STATUS[v.status], v.status) },
              { label: "Started by", value: v.expand?.started_by?.name, hint: fmtDate(v.created) },
              { label: "Completed", value: v.completed_at ? fmtDate(v.completed_at) : null, hint: v.completed_at ? `By ${v.expand?.completed_by?.name || "—"}` : undefined },
              { label: "Notes", value: v.notes ? <span className="whitespace-pre-line">{v.notes}</span> : null, wide: true },
            ]}
          />
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Signed count sheets, photos of damaged assets, Internal Audit's observation note." />
          <DocumentUploads collection="asset_verifications" record={v} canAdd={can("manage_fixed_assets")} canRemove={open && can("manage_fixed_assets")} onChange={() => q.refetch()} hint="PDF, images, Word or Excel, up to 20 MB each" />
        </Card>
      )}

      {tab === "activity" && <Activity actions={[]} audit={(history.data?.items || []) as any[]} loading={history.isLoading} />}

      {elsewhere && (
        <Modal
          open
          onClose={() => setElsewhere(null)}
          size="sm"
          title="Where was it found?"
          description={`${elsewhere.expand?.asset?.code} ${elsewhere.expand?.asset?.name}, expected at ${elsewhere.expected_location || "no location"}. Its location is updated when the count is completed.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setElsewhere(null)}>Cancel</Button>
              <Button variant="primary" disabled={!where.trim()} onClick={() => { const l = elsewhere; setElsewhere(null); record(l, "found_elsewhere", where.trim()); }}>Record</Button>
            </>
          }
        >
          <Field label="Found at" required htmlFor="ct-where">
            <Input id="ct-where" autoFocus value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. HQ 3rd floor, DSG office" />
          </Field>
        </Modal>
      )}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${v.number}?`}
        description="The results recorded so far are not applied to the register."
        confirmLabel="Cancel count"
        danger
        reason={{ label: "Reason", min: 5, placeholder: "Why the count is stopped" }}
        onConfirm={async (reason) => {
          try {
            await assetsApi.count(v.id, "cancel", { reason });
            toast.success(`${v.number} cancelled`);
            q.refetch();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Page>
  );
}
