/**
 * One fixed asset: its card, value (cost, depreciation, net book value), the depreciation charged and still to come,
 * its history (custodians, locations, transfers, status changes, counts), maintenance, disposal and GL postings.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import Barcode from "react-barcode";
import html2canvas from "html2canvas";
import { ArrowRightLeft, Boxes, ClipboardList, Download, Info, PackageCheck, RefreshCcw, Tag, Trash2, UserRound, Wrench } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions, useAuth } from "@/context/auth.context";
import { ACQUISITION, ASSET_STATUS, CONDITIONS, COUNT_RESULTS, DEPRECIATION_METHODS, DISPOSAL_METHODS, DOC_STATUS, MAINTENANCE_KINDS, MOVEMENT_KINDS, assetsApi } from "@/lib/assets";
import { imsApi } from "@/lib/ims";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import { Activity } from "@/components/enterprise/Approval";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  KpiBand,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Pill,
  PillTone,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtMoneyShort,
} from "@/components/ims";
import { AssetCardDialog, AssignDialog, DisposalDialog, MaintenanceDialog, StatusDialog, TransferDialog } from "@/components/assets/AssetDialogs";
import { cn } from "@/utils";

const LIST = "/dashboard/assets/register";
const monthLabel = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
/** Count results are tags, not statuses. */
const RESULT_TONE: Record<string, PillTone> = { neutral: "neutral", success: "success", info: "info", warning: "warning", danger: "danger", violet: "orange" };
/** The physical state of an asset: "In use", "Under maintenance" (the glossary word is a record state). */
const stateOf = (s?: string) => ASSET_STATUS[s || ""]?.note || ASSET_STATUS[s || ""]?.label || s || "—";

export default function AssetDetail() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user }: any = useAuth();
  const [tab, setTab] = React.useState("details");
  const [dialog, setDialog] = React.useState<"" | "card" | "assign" | "status" | "transfer" | "maintenance" | "dispose" | "tag">("");
  const q = useQuery(["asset", assetId], async () => {
    const a: any = await pocketbase.collection("assets").getOne(assetId!, { expand: "category,type,department,assigned_to,funding_source,project,supplier,purchase_order,goods_receipt,invoice,capitalisation_journal,capitalised_by,disposal" });
    const finance = can(["view_fixed_assets", "manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation", "view_assets", "export_assets"]);
    const [movements, maintenance, lines, disposals] = await Promise.all([
      pocketbase.collection("asset_movements").getFullList({ filter: `asset = "${a.id}"`, sort: "-created", expand: "from_department,to_department,from_custodian,to_custodian,requested_by" }).catch(() => [] as any[]),
      finance ? pocketbase.collection("asset_maintenance").getFullList({ filter: `asset = "${a.id}"`, sort: "-date", expand: "supplier,recorded_by" }).catch(() => [] as any[]) : Promise.resolve([] as any[]),
      finance ? pocketbase.collection("depreciation_lines").getFullList({ filter: `asset = "${a.id}" && status = "posted"`, sort: "year,month", expand: "run" }).catch(() => [] as any[]) : Promise.resolve([] as any[]),
      finance ? pocketbase.collection("asset_disposals").getFullList({ filter: `asset = "${a.id}"`, sort: "-created" }).catch(() => [] as any[]) : Promise.resolve([] as any[]),
    ]);
    return { a, movements, maintenance, lines, disposals, finance };
  });
  const schedule = useQuery(["asset-schedule", assetId], () => assetsApi.schedule(assetId!), { enabled: Boolean(q.data?.a?.capitalised && q.data.finance) });
  const history = useQuery(["audit", "assets", assetId], () => imsApi.audit({ collection: "assets", record: assetId, perPage: 60 }), { enabled: Boolean(assetId) });
  const refresh = () => {
    q.refetch();
    schedule.refetch();
    history.refetch();
  };
  const done = () => {
    setDialog("");
    refresh();
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
          <EmptyState icon={Boxes} text="This asset is not available. It may not exist, or it is outside what your role can see." action={<ButtonLink to={LIST}>Back to the asset register</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { a, movements, maintenance, lines, disposals, finance } = q.data;
  const x = a.expand || {};
  const manage = can("manage_fixed_assets");
  const live = a.status !== "disposed";
  const headOf = can("request_asset_transfer") && user?.department && user.department === a.department;
  const openDisposal = (disposals as any[]).find((d) => ["draft", "pending_approval", "returned"].includes(d.status));
  const openTransfer = (movements as any[]).find((m) => m.kind === "transfer" && ["draft", "pending_approval", "returned"].includes(m.status));
  const nbv = a.capitalised ? a.net_book_value : 0;
  const pct = a.capitalised && a.cost ? Math.max(0, Math.min(100, (nbv / a.cost) * 100)) : 0;
  const method = a.method || x.category?.method;
  const life = a.useful_life_months || x.category?.useful_life_months;
  const projection = schedule.data?.rows || [];
  const endsIn = projection.length ? projection[projection.length - 1].label : "";
  const toCome = projection.reduce((t, r) => t + r.charge, 0);
  const showAccounting = finance && ((disposals as any[]).length > 0 || Boolean(a.capitalisation_journal));
  const tabs = [
    { key: "details", label: "Details" },
    ...(finance && a.capitalised ? [{ key: "value", label: "Depreciation", count: lines.length }] : []),
    { key: "history", label: "History", count: movements.length },
    ...(finance ? [{ key: "maintenance", label: "Maintenance", count: maintenance.length }] : []),
    { key: "activity", label: "Activity" },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  const canTransfer = (manage || headOf) && live && !openTransfer;
  const primary =
    manage && live && !a.capitalised ? (
      <Button variant="primary" icon={PackageCheck} onClick={() => setDialog("card")}>Complete the card</Button>
    ) : manage && live ? (
      <Button variant="primary" icon={UserRound} onClick={() => setDialog("assign")}>Change custodian</Button>
    ) : canTransfer ? (
      <Button variant="primary" icon={ArrowRightLeft} onClick={() => setDialog("transfer")}>Request a transfer</Button>
    ) : null;
  const secondary =
    manage && live ? (
      <>
        {canTransfer && <Button icon={ArrowRightLeft} onClick={() => setDialog("transfer")}>Transfer</Button>}
        <Button icon={Wrench} onClick={() => setDialog("maintenance")}>Record maintenance</Button>
      </>
    ) : (
      <Button icon={Tag} onClick={() => setDialog("tag")}>Asset tag</Button>
    );
  const more: MenuItem[] = [
    { label: "Change status", icon: RefreshCcw, onSelect: () => setDialog("status"), hidden: !(manage && live) },
    { label: "Asset tag", icon: Tag, onSelect: () => setDialog("tag"), hidden: !(manage && live) },
    { label: "Dispose of the asset", icon: Trash2, danger: true, onSelect: () => setDialog("dispose"), hidden: !(manage && live && !openDisposal) },
  ];

  const chargedColumns: Column<any>[] = [
    { key: "month", header: "Month", nowrap: true, cell: (l) => monthLabel(l.year, l.month) },
    { key: "charge", header: "Charge (RWF)", numeric: true, cell: (l) => <Num value={l.charge} />, total: <Num value={(lines as any[]).reduce((t, l) => t + (l.charge || 0), 0)} /> },
    { key: "accumulated", header: "Accumulated (RWF)", numeric: true, cell: (l) => <Num value={l.accumulated_after} /> },
    { key: "nbv", header: "Net book value (RWF)", numeric: true, cell: (l) => <Num value={l.net_book_value} /> },
  ];
  const next12 = projection.slice(0, 12);
  const projectionColumns: Column<any>[] = [
    { key: "month", header: "Month", nowrap: true, cell: (r) => r.label },
    { key: "charge", header: "Charge (RWF)", numeric: true, cell: (r) => <Num value={r.charge} />, total: <Num value={next12.reduce((t, r) => t + r.charge, 0)} /> },
    { key: "nbv", header: "Net book value (RWF)", numeric: true, cell: (r) => <Num value={r.net_book_value} /> },
  ];
  const movementColumns: Column<any>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (m) => fmtDate(m.created) },
    {
      key: "kind",
      header: "Movement",
      nowrap: true,
      cell: (m) => <span className="font-semibold">{MOVEMENT_KINDS[m.kind] || m.kind}</span>,
      sub: (m) => (m.number ? (m.kind === "transfer" ? <Link to={`/dashboard/assets/transfers?open=${m.id}`} className="whitespace-nowrap font-mono text-ims-link hover:underline">{m.number}</Link> : <DocNo value={m.number} />) : null),
    },
    { key: "change", header: "Change", clamp: true, cell: (m) => describe(m), sub: (m) => (m.reason ? `“${m.reason}”` : null) },
    { key: "by", header: "By", className: "max-w-[180px]", cell: (m) => (m.expand?.requested_by ? <span className="block truncate">{m.expand.requested_by.name}</span> : <span className="text-ims-faint">—</span>) },
    { key: "status", header: "Status", cell: (m) => (m.kind === "transfer" ? <StatusBadge status={m.status} map={DOC_STATUS} /> : <span className="text-ims-faint">—</span>) },
  ];
  const maintenanceColumns: Column<any>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (m) => fmtDate(m.date) },
    { key: "kind", header: "Type", nowrap: true, cell: (m) => MAINTENANCE_KINDS[m.kind] || m.kind },
    { key: "description", header: "Work done", clamp: true, cell: (m) => m.description, sub: (m) => (m.downtime_days ? `${m.downtime_days} day${m.downtime_days === 1 ? "" : "s"} out of use` : null) },
    { key: "by", header: "Done by", className: "max-w-[200px]", cell: (m) => m.expand?.supplier?.name || m.provider || <span className="text-ims-faint">—</span> },
    { key: "cost", header: "Cost (RWF)", numeric: true, cell: (m) => (m.cost ? <Num value={m.cost} /> : <span className="text-ims-faint">—</span>), total: <Num value={(maintenance as any[]).reduce((t, m) => t + (m.cost || 0), 0)} /> },
    { key: "next", header: "Next due", nowrap: true, cell: (m) => (m.next_due ? fmtDate(m.next_due) : <span className="text-ims-faint">—</span>) },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to the asset register", to: LIST }}
        number={a.code}
        type={[x.category?.name || "Asset", x.type?.name].filter(Boolean).join(" · ")}
        status={ASSET_STATUS[a.status]?.label || a.status}
        statusNote={ASSET_STATUS[a.status]?.note}
        title={a.name}
        facts={[
          x.department?.name,
          x.assigned_to?.name ? { label: "Custodian", value: x.assigned_to.name } : { label: "Custodian", value: "None" },
          a.location_name,
          a.condition && live ? { label: "Condition", value: <span className={cn(a.condition === "damaged" || a.condition === "poor" ? "text-ims-warning" : undefined)}>{CONDITIONS[a.condition] || a.condition}</span> } : null,
          !a.capitalised ? <strong key="cost" className="font-bold text-ims-text">{fmtMoney(a.cost)}</strong> : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary}
            {primary}
          </>
        }
      />

      {!a.capitalised && live && (
        <Banner tone="warning">
          Received{x.goods_receipt ? ` on ${x.goods_receipt.number}` : ""}, not in the register yet. {manage ? "Complete the card to capitalise it." : "The Store & Asset Officer completes its card."}
        </Banner>
      )}
      {openTransfer && (
        <Banner tone="info">
          <Link className="whitespace-nowrap font-bold underline underline-offset-2 hover:no-underline" to={`/dashboard/assets/transfers?open=${openTransfer.id}`}>{openTransfer.number}</Link>: transfer to {openTransfer.expand?.to_department?.name}, {DOC_STATUS[openTransfer.status]?.label.toLowerCase()}.
        </Banner>
      )}
      {openDisposal && (
        <Banner tone="info">
          <Link className="whitespace-nowrap font-bold underline underline-offset-2 hover:no-underline" to={`/dashboard/assets/disposals/${openDisposal.id}`}>{openDisposal.number}</Link>: {DISPOSAL_METHODS[openDisposal.method]?.toLowerCase()}, {DOC_STATUS[openDisposal.status]?.label.toLowerCase()}.
        </Banner>
      )}

      {a.capitalised && (
        <KpiBand
          items={[
            { label: "Cost", value: fmtMoneyShort(a.cost), sub: a.residual_value ? `Residual ${fmtMoney(a.residual_value)}` : "Historical cost" },
            { label: "Depreciation charged", value: fmtMoneyShort(a.accumulated_depreciation), sub: a.last_depreciated ? `To ${monthLabel(+a.last_depreciated.slice(0, 4), +a.last_depreciated.slice(5, 7))}` : "Nothing charged yet" },
            { label: "Net book value", value: fmtMoneyShort(nbv), sub: `${Math.round(pct)}% of cost`, tone: "success" },
            ...(finance
              ? [{ label: "Still to depreciate", value: schedule.isLoading ? "…" : fmtMoneyShort(toCome), sub: endsIn ? `Until ${endsIn}` : schedule.data?.note || "Fully depreciated", onClick: () => setTab("value") }]
              : []),
          ]}
        />
      )}

      <Tabs label="Asset sections" active={active} onChange={setTab} tabs={tabs} />

      {active === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className={cn(showAccounting && "xl:col-span-2", !showAccounting && "xl:col-span-3")}>
            <CardHeader title="Asset card" />
            <Details
              columns={showAccounting ? 2 : 3}
              items={[
                { label: "Department", value: x.department?.name },
                { label: "Location", value: a.location_name },
                { label: "Custodian", value: x.assigned_to?.name, hint: a.assigned_at ? `Since ${fmtDate(a.assigned_at)}` : undefined },
                { label: "Serial or plate number", value: a.serial_number ? <span className="font-mono">{a.serial_number}</span> : null },
                { label: "Funding", value: [x.funding_source ? `${x.funding_source.code} · ${x.funding_source.name}` : "", x.project ? `Project ${x.project.code}` : ""].filter(Boolean).join(" · ") },
                { label: "Supplier", value: x.supplier?.name, hint: [x.purchase_order?.number, x.goods_receipt?.number, x.invoice?.number].filter(Boolean).join(" · ") || undefined },
                { label: "Acquired", value: a.purchased_at ? fmtDate(a.purchased_at) : null, hint: a.acquisition_type ? ACQUISITION[a.acquisition_type] : undefined },
                {
                  label: "Depreciation",
                  value: a.capitalised ? (method === "none" ? "Not depreciated" : `${DEPRECIATION_METHODS[method] || method}${life ? ` over ${life} months` : ""}`) : "",
                  hint: a.depreciation_start ? `From ${monthLabel(+a.depreciation_start.slice(0, 4), +a.depreciation_start.slice(5, 7))}${a.residual_value ? ` · residual ${fmtMoney(a.residual_value)}` : ""}` : undefined,
                },
                {
                  label: "Charged to",
                  value: a.last_depreciated ? monthLabel(+a.last_depreciated.slice(0, 4), +a.last_depreciated.slice(5, 7)) : a.capitalised ? "Nothing yet" : "",
                  hint: endsIn ? `Fully depreciated in ${endsIn}` : undefined,
                },
                { label: "In the register since", value: a.capitalised && a.capitalised_at ? fmtDate(a.capitalised_at) : "", hint: x.capitalised_by?.name ? `By ${x.capitalised_by.name}` : undefined },
                {
                  label: "Last count",
                  value: a.last_verified ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {fmtDate(a.last_verified)}
                      {a.last_verification_result && <Pill tone={RESULT_TONE[COUNT_RESULTS[a.last_verification_result]?.tone || "neutral"]}>{COUNT_RESULTS[a.last_verification_result]?.label || a.last_verification_result}</Pill>}
                    </span>
                  ) : null,
                },
                { label: "Disposed", value: a.disposed_at ? fmtDate(a.disposed_at) : "", hint: x.disposal ? `${x.disposal.number} · ${DISPOSAL_METHODS[x.disposal.method]}` : undefined },
                ...(a.description || a.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{a.description || a.notes}</span>, wide: true }] : []),
              ]}
            />
          </Card>
          {showAccounting && (
            <Card>
              <CardHeader title="Accounting" subtitle="What the asset posted to the general ledger." />
              <ul className="divide-y divide-ims-divider">
                {x.capitalisation_journal && (
                  <li className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block text-t-body font-semibold text-ims-text">{a.acquisition_type === "opening_balance" ? "Opening register" : "Capitalisation"}</span>
                      <span className="block text-t-small text-ims-muted">{x.capitalisation_journal.description}</span>
                    </span>
                    {can(["view_journals", "export_ledger", "approve_journals"]) ? (
                      <Link className="shrink-0 whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline" to={`/dashboard/finance/journals/${a.capitalisation_journal}`}>{x.capitalisation_journal.number}</Link>
                    ) : (
                      <DocNo value={x.capitalisation_journal.number} className="shrink-0" />
                    )}
                  </li>
                )}
                {(disposals as any[]).map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <Link className="block whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline" to={`/dashboard/assets/disposals/${d.id}`}>{d.number}</Link>
                      <span className="block text-t-small text-ims-muted">
                        {DISPOSAL_METHODS[d.method]}
                        {d.status === "approved" ? ` · ${d.gain_loss >= 0 ? "gain" : "loss"} ${fmtMoney(Math.abs(d.gain_loss))}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={d.status} map={DOC_STATUS} hideNote />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {active === "value" && finance && a.capitalised && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-5">
              <CardHeader title="Charged" subtitle={a.opening_accumulated > 0 ? `${fmtMoney(a.opening_accumulated)} before the system went live (opening register).` : "Monthly depreciation posted to the general ledger."} />
            </div>
            <DataTable
              columns={chargedColumns}
              rows={lines as any[]}
              rowKey={(l) => l.id}
              onRowClick={(l) => navigate(`/dashboard/assets/depreciation/${l.run}`)}
              minWidth={460}
              caption="Depreciation charged"
              empty={<EmptyState compact text="No monthly depreciation posted yet." />}
            />
          </Card>
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-5">
              <CardHeader title="Still to come" subtitle={projection.length > 12 ? `The next 12 of ${projection.length} months.` : "The months left until the asset is fully depreciated."} />
            </div>
            <DataTable
              columns={projectionColumns}
              rows={next12}
              rowKey={(r) => r.period}
              loading={schedule.isLoading}
              error={schedule.isError ? schedule.error : undefined}
              onRetry={() => schedule.refetch()}
              totalLabel={projection.length > 12 ? "Next 12 months" : "Total"}
              minWidth={380}
              caption="Depreciation still to come"
              empty={<EmptyState compact text={schedule.data?.note || "Fully depreciated."} />}
            />
          </Card>
        </div>
      )}

      {active === "history" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHeader title="History" subtitle="Custodians, locations, transfers, status changes and count results." />
          </div>
          <DataTable columns={movementColumns} rows={movements as any[]} rowKey={(m) => m.id} minWidth={760} caption="Asset history" empty={<EmptyState compact icon={ClipboardList} text="No movement recorded." />} />
        </Card>
      )}

      {active === "maintenance" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHeader title="Maintenance" subtitle="Services, repairs and inspections. Invoices are paid through payment vouchers." />
          </div>
          <DataTable columns={maintenanceColumns} rows={maintenance as any[]} rowKey={(m) => m.id} minWidth={760} caption="Maintenance" empty={<EmptyState compact icon={Wrench} text="No maintenance recorded." />} />
        </Card>
      )}

      {active === "activity" && <Activity actions={[]} audit={(history.data?.items || []) as any[]} loading={history.isLoading} />}

      {dialog === "card" && <AssetCardDialog asset={a} onClose={() => setDialog("")} onSaved={() => done()} />}
      {dialog === "assign" && <AssignDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "status" && <StatusDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "transfer" && <TransferDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "maintenance" && <MaintenanceDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "dispose" && <DisposalDialog asset={a} onClose={() => setDialog("")} onSaved={(id) => navigate(`/dashboard/assets/disposals/${id}`)} />}
      {dialog === "tag" && <TagDialog asset={a} onClose={() => setDialog("")} />}
    </Page>
  );
}

function Banner({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  const Icon = tone === "warning" ? ClipboardList : Info;
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-card border px-4 py-3 text-t-body", tone === "warning" ? "border-ims-warning/30 bg-ims-warning-bg text-ims-warning" : "border-ims-link/25 bg-ims-info-bg text-ims-info")}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function describe(m: any) {
  const e = m.expand || {};
  const bits: string[] = [];
  if (m.from_department !== m.to_department && m.to_department) bits.push(`${e.from_department?.name || "—"} → ${e.to_department?.name}`);
  if (m.from_custodian !== m.to_custodian) bits.push(`${e.from_custodian?.name || "Store"} → ${e.to_custodian?.name || "Store"}`);
  if (m.from_location !== m.to_location && m.to_location) bits.push(`${m.from_location || "—"} → ${m.to_location}`);
  // The physical states read better here than the record state: "In use → Under maintenance".
  if (m.from_status !== m.to_status && m.to_status) bits.push(`${m.from_status ? stateOf(m.from_status) : "—"} → ${stateOf(m.to_status)}`);
  return bits.join(" · ") || "No change recorded.";
}

function TagDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState(false);
  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(ref.current, { scale: 3, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${asset.code.replace(/[^A-Za-z0-9-]+/g, "-")}.png`;
      link.click();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Asset tag for ${asset.code}`}
      description="Print it on a label and stick it on the asset. The count sheets use the tag number."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Download} onClick={download} loading={busy}>Download PNG</Button>
        </>
      }
    >
      <div ref={ref} className="mx-auto w-[300px] max-w-full rounded-control border-2 border-ims-text bg-ims-card px-3 py-2 text-center">
        <p className="text-t-hint font-bold text-ims-text">RALGA · Property of the association</p>
        <div className="flex justify-center"><Barcode value={asset.code} width={1.3} height={46} fontSize={12} margin={4} /></div>
        <p className="truncate text-t-hint text-ims-body">{asset.name}</p>
      </div>
    </Modal>
  );
}
