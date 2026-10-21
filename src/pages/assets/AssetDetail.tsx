/**
 * One fixed asset: its card, value (cost, depreciation, net book value), the depreciation charged and still to come,
 * its history (custodians, locations, transfers, status changes, counts), maintenance, disposal and GL postings.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import Barcode from "react-barcode";
import html2canvas from "html2canvas";
import { ArrowRightLeft, Boxes, ClipboardList, Download, PackageCheck, Tag, Trash2, UserRound, Wrench } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions, useAuth } from "@/context/auth.context";
import { ACQUISITION, ASSET_STATUS, CONDITIONS, COUNT_RESULTS, DEPRECIATION_METHODS, DISPOSAL_METHODS, DOC_STATUS, MAINTENANCE_KINDS, MOVEMENT_KINDS, assetsApi, money } from "@/lib/assets";
import { imsApi, showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { AssetCardDialog, AssignDialog, DisposalDialog, MaintenanceDialog, StatusDialog, TransferDialog } from "@/components/assets/AssetDialogs";
import { cn } from "@/utils";

const RIBBON: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  disposed: { label: "Disposed", tone: "neutral" }, lost: { label: "Lost", tone: "danger" }, damaged: { label: "Damaged", tone: "danger" }, under_maintenance: { label: "Maintenance", tone: "warning" },
};
const th = "whitespace-nowrap px-2.5 py-2";
const td = "whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums";
const monthLabel = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default function AssetDetail() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user }: any = useAuth();
  const [tab, setTab] = React.useState("value");
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

  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={Boxes} title="Asset not found" text="It may not exist, or it is outside what your role can see." /></div>;
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
  const tabs = [
    ...(finance && a.capitalised ? [{ key: "value", label: "Depreciation" }] : []),
    { key: "history", label: "History", count: movements.length },
    ...(finance ? [{ key: "maintenance", label: "Maintenance", count: maintenance.length }] : []),
    ...(finance && (disposals.length || a.capitalisation_journal) ? [{ key: "accounting", label: "Accounting" }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <DocumentPage chatter={<Chatter items={toChatter([], (history.data?.items || []) as any[])} />}>
      <ControlBar
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Asset register", link: "/dashboard/assets/register" }, { title: a.code }]}
        steps={[{ key: "received", label: "Received" }, { key: "register", label: "In the register" }, { key: "disposed", label: "Disposed" }]}
        current={a.status === "disposed" ? "disposed" : a.capitalised ? "register" : "received"}
        actions={
          <>
            {manage && live && !a.capitalised && <Button size="sm" onClick={() => setDialog("card")}><PackageCheck size={14} /> Complete the card</Button>}
            {manage && live && a.capitalised && <Button size="sm" variant="outline" onClick={() => setDialog("assign")}><UserRound size={14} /> Custodian</Button>}
            {manage && live && <Button size="sm" variant="outline" onClick={() => setDialog("status")}>Status</Button>}
            {manage && live && <Button size="sm" variant="outline" onClick={() => setDialog("maintenance")}><Wrench size={14} /> Maintenance</Button>}
            {(manage || headOf) && live && !openTransfer && <Button size="sm" variant="outline" onClick={() => setDialog("transfer")}><ArrowRightLeft size={14} /> Transfer</Button>}
            {manage && live && !openDisposal && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDialog("dispose")}><Trash2 size={14} /> Dispose</Button>}
            <Button size="sm" variant="ghost" onClick={() => setDialog("tag")}><Tag size={14} /> Tag</Button>
          </>
        }
      />
      {(openTransfer || openDisposal || (!a.capitalised && live)) && (
        <div className="space-y-2">
          {!a.capitalised && live && <Notice>Received{x.goods_receipt ? ` on ${x.goods_receipt.number}` : ""} — not in the register yet. {manage ? "Complete the card to capitalise it." : "The Store & Asset Officer completes its card."}</Notice>}
          {openTransfer && <Notice><Link className="font-medium underline" to={`/dashboard/assets/transfers?open=${openTransfer.id}`}>{openTransfer.number}</Link>: transfer to {openTransfer.expand?.to_department?.name} — {DOC_STATUS[openTransfer.status]?.label.toLowerCase()}.</Notice>}
          {openDisposal && <Notice><Link className="font-medium underline" to={`/dashboard/assets/disposals/${openDisposal.id}`}>{openDisposal.number}</Link>: {DISPOSAL_METHODS[openDisposal.method]?.toLowerCase()} — {DOC_STATUS[openDisposal.status]?.label.toLowerCase()}.</Notice>}
        </div>
      )}
      <Sheet ribbon={RIBBON[a.status]}>
        <SheetTitle kicker={[x.category?.name || "Asset", x.type?.name].filter(Boolean).join(" · ")} title={a.name} badges={<><StatusBadge status={a.status} map={ASSET_STATUS} />{a.condition && live && <Badge tone={a.condition === "damaged" || a.condition === "poor" ? "warning" : "neutral"}>{CONDITIONS[a.condition]}</Badge>}</>} />
        <div className="mb-5 grid gap-4 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-[auto_1fr]">
          <div>
            <p className="text-[11.5px] text-slate-500">Tag</p>
            <p className="font-mono text-[18px] font-semibold tracking-tight text-slate-900">{a.code}</p>
            {a.serial_number && <p className="font-mono text-[12px] text-slate-500">S/N {a.serial_number}</p>}
          </div>
          {a.capitalised ? (
            <div className="grid grid-cols-3 gap-3 sm:text-right">
              <div><p className="text-[11.5px] text-slate-500">Cost</p><p className="text-[16px] font-semibold tabular-nums">RWF {money(a.cost)}</p></div>
              <div><p className="text-[11.5px] text-slate-500">Depreciation</p><p className="text-[16px] font-semibold tabular-nums">RWF {money(a.accumulated_depreciation)}</p></div>
              <div><p className="text-[11.5px] text-slate-500">Net book value</p><p className="text-[16px] font-semibold tabular-nums text-primaryDark">RWF {money(nbv)}</p></div>
              <div className="col-span-3 h-2 overflow-hidden rounded-full bg-slate-200" title={`${Math.round(pct)}% of cost remaining`}><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            </div>
          ) : <p className="self-center text-[13px] text-slate-600 sm:text-right">Cost RWF {money(a.cost)} — not yet in the register</p>}
        </div>
        <FieldGrid
          left={[
            { label: "Department", value: x.department?.name },
            { label: "Location", value: a.location_name },
            { label: "Custodian", value: x.assigned_to?.name, hint: a.assigned_at ? `since ${showDay(a.assigned_at)}` : undefined },
            { label: "Funding", value: [x.funding_source ? `${x.funding_source.code} · ${x.funding_source.name}` : "", x.project ? `project ${x.project.code}` : ""].filter(Boolean).join(" · ") },
            { label: "Supplier", value: x.supplier?.name, hint: [x.purchase_order?.number, x.goods_receipt?.number, x.invoice?.number].filter(Boolean).join(" · ") || undefined },
            { label: "Notes", value: a.description || a.notes },
          ]}
          right={[
            { label: "Acquired", value: showDay(a.purchased_at), hint: a.acquisition_type ? ACQUISITION[a.acquisition_type] : undefined },
            { label: "Depreciation", value: a.capitalised ? (method === "none" ? "Not depreciated" : `${DEPRECIATION_METHODS[method] || method}${life ? ` over ${life} months` : ""}`) : "", hint: a.depreciation_start ? `from ${monthLabel(+a.depreciation_start.slice(0, 4), +a.depreciation_start.slice(5, 7))}${a.residual_value ? ` · residual RWF ${money(a.residual_value)}` : ""}` : undefined },
            { label: "Charged to", value: a.last_depreciated ? monthLabel(+a.last_depreciated.slice(0, 4), +a.last_depreciated.slice(5, 7)) : a.capitalised ? "Nothing yet" : "", hint: endsIn ? `fully depreciated in ${endsIn}` : undefined },
            { label: "In the register since", value: a.capitalised ? showDay(a.capitalised_at) : "", hint: x.capitalised_by?.name ? `by ${x.capitalised_by.name}` : undefined },
            { label: "Last count", value: a.last_verified ? `${showDay(a.last_verified)} — ${COUNT_RESULTS[a.last_verification_result]?.label || a.last_verification_result}` : "" },
            { label: "Disposed", value: a.disposed_at ? showDay(a.disposed_at) : "", hint: x.disposal ? `${x.disposal.number} · ${DISPOSAL_METHODS[x.disposal.method]}` : undefined },
          ]}
        />
        <Notebook active={active} onChange={setTab} tabs={tabs} />
        <div className="pt-4">
          {active === "value" && finance && a.capitalised && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold">Charged</h3>
                {a.opening_accumulated > 0 && <p className="mb-2 text-[12.5px] text-slate-600">RWF {money(a.opening_accumulated)} before the system went live (opening register).</p>}
                {lines.length ? (
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wider text-slate-500"><th className="py-1.5 font-semibold">Month</th><th className="py-1.5 text-right font-semibold">Charge</th><th className="py-1.5 text-right font-semibold">Accumulated</th><th className="py-1.5 text-right font-semibold">Net book value</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(lines as any[]).map((l) => <tr key={l.id}><td className="py-1.5"><Link className="hover:underline" to={`/dashboard/assets/depreciation/${l.run}`}>{monthLabel(l.year, l.month)}</Link></td><td className="py-1.5 text-right tabular-nums">{money(l.charge)}</td><td className="py-1.5 text-right tabular-nums">{money(l.accumulated_after)}</td><td className="py-1.5 text-right tabular-nums">{money(l.net_book_value)}</td></tr>)}
                    </tbody>
                  </table>
                ) : <p className="text-[12.5px] text-slate-500">No monthly depreciation posted yet.</p>}
              </div>
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold">Still to come</h3>
                {schedule.isLoading ? <ListSkeleton rows={3} /> : projection.length ? (
                  <>
                    <p className="mb-2 text-[12.5px] text-slate-600">RWF {money(projection.reduce((t, r) => t + r.charge, 0))} over {projection.length} month{projection.length === 1 ? "" : "s"}, until {endsIn}.</p>
                    <table className="w-full text-[12.5px]">
                      <thead><tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wider text-slate-500"><th className="py-1.5 font-semibold">Month</th><th className="py-1.5 text-right font-semibold">Charge</th><th className="py-1.5 text-right font-semibold">Net book value</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {projection.slice(0, 12).map((r) => <tr key={r.period}><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right tabular-nums">{money(r.charge)}</td><td className="py-1.5 text-right tabular-nums">{money(r.net_book_value)}</td></tr>)}
                      </tbody>
                    </table>
                    {projection.length > 12 && <p className="mt-1 text-[12px] text-slate-500">… and {projection.length - 12} more months.</p>}
                  </>
                ) : <p className="text-[12.5px] text-slate-500">{schedule.data?.note || "Fully depreciated."}</p>}
              </div>
            </div>
          )}
          {active === "history" && (
            movements.length ? (
              <ol className="space-y-3">
                {(movements as any[]).map((m) => (
                  <li key={m.id} className="rounded-md border border-slate-200 px-3 py-2 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{MOVEMENT_KINDS[m.kind] || m.kind}{m.number ? <span className="ml-1.5 font-mono text-[11.5px] text-slate-500">{m.number}</span> : null}</span>
                      <span className="flex items-center gap-2 text-[12px] text-slate-500">{m.kind === "transfer" && <StatusBadge status={m.status} map={DOC_STATUS} />}{showDay(m.created)}{m.expand?.requested_by ? ` · ${m.expand.requested_by.name}` : ""}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-slate-600">
                      {describe(m)}
                    </p>
                    {m.reason && <p className="mt-0.5 text-[12px] text-slate-500">“{m.reason}”</p>}
                  </li>
                ))}
              </ol>
            ) : <p className="text-[13px] text-slate-500">No movement recorded.</p>
          )}
          {active === "maintenance" && (
            maintenance.length ? (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="dnr-grid w-full min-w-[640px] text-[12.5px]">
                  <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Work done</th><th className={th}>By</th><th className={cn(th, "text-right")}>Cost</th><th className={th}>Next due</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(maintenance as any[]).map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap px-2.5 py-1.5">{showDay(m.date)}</td>
                        <td className="px-2.5 py-1.5">{MAINTENANCE_KINDS[m.kind] || m.kind}</td>
                        <td className="px-2.5 py-1.5">{m.description}{m.downtime_days ? <span className="block text-[11.5px] text-slate-500">{m.downtime_days} day{m.downtime_days === 1 ? "" : "s"} out of use</span> : null}</td>
                        <td className="px-2.5 py-1.5">{m.expand?.supplier?.name || m.provider || "—"}</td>
                        <td className={td}>{m.cost ? money(m.cost) : "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5">{m.next_due ? showDay(m.next_due) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-2.5 py-1.5" colSpan={4}>Total</td><td className={td}>{money((maintenance as any[]).reduce((t, m) => t + (m.cost || 0), 0))}</td><td /></tr></tfoot>
                </table>
              </div>
            ) : <p className="text-[13px] text-slate-500">No maintenance recorded.</p>
          )}
          {active === "accounting" && (
            <ul className="space-y-2 text-[13px]">
              {x.capitalisation_journal && (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                  <span>{a.acquisition_type === "opening_balance" ? "Opening register" : "Capitalisation"}: {x.capitalisation_journal.description}</span>
                  {can(["view_journals", "export_ledger", "approve_journals"]) ? <Link className="font-mono text-primaryDark hover:underline" to={`/dashboard/finance/journals/${a.capitalisation_journal}`}>{x.capitalisation_journal.number}</Link> : <span className="font-mono">{x.capitalisation_journal.number}</span>}
                </li>
              )}
              {(disposals as any[]).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                  <span><Link className="font-mono text-primaryDark hover:underline" to={`/dashboard/assets/disposals/${d.id}`}>{d.number}</Link> {DISPOSAL_METHODS[d.method]} · {d.status === "approved" ? `${d.gain_loss >= 0 ? "gain" : "loss"} RWF ${money(Math.abs(d.gain_loss))}` : DOC_STATUS[d.status]?.label}</span>
                  <StatusBadge status={d.status} map={DOC_STATUS} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
      {dialog === "card" && <AssetCardDialog asset={a} onClose={() => setDialog("")} onSaved={() => done()} />}
      {dialog === "assign" && <AssignDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "status" && <StatusDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "transfer" && <TransferDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "maintenance" && <MaintenanceDialog asset={a} onClose={() => setDialog("")} onDone={done} />}
      {dialog === "dispose" && <DisposalDialog asset={a} onClose={() => setDialog("")} onSaved={(id) => navigate(`/dashboard/assets/disposals/${id}`)} />}
      {dialog === "tag" && <TagDialog asset={a} onClose={() => setDialog("")} />}
    </DocumentPage>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"><ClipboardList size={14} className="shrink-0" /> <span>{children}</span></p>;
}

function describe(m: any) {
  const e = m.expand || {};
  const bits: string[] = [];
  if (m.from_department !== m.to_department && m.to_department) bits.push(`${e.from_department?.name || "—"} → ${e.to_department?.name}`);
  if (m.from_custodian !== m.to_custodian) bits.push(`${e.from_custodian?.name || "store"} → ${e.to_custodian?.name || "store"}`);
  if (m.from_location !== m.to_location && m.to_location) bits.push(`${m.from_location || "—"} → ${m.to_location}`);
  if (m.from_status !== m.to_status && m.to_status) bits.push(`${ASSET_STATUS[m.from_status]?.label || m.from_status || "—"} → ${ASSET_STATUS[m.to_status]?.label || m.to_status}`);
  return bits.join(" · ") || "No change recorded.";
}

function TagDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const download = async () => {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current, { scale: 3, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${asset.code.replace(/[^A-Za-z0-9-]+/g, "-")}.png`;
    link.click();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle>Asset tag</DialogTitle>
          <DialogDescription>Print it on a label and stick it on the asset; the count sheets use the tag number.</DialogDescription>
        </DialogHeader>
        <div ref={ref} className="mx-auto w-[300px] rounded-md border-2 border-slate-800 bg-white px-3 py-2 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-800">RALGA — property of the association</p>
          <div className="flex justify-center"><Barcode value={asset.code} width={1.3} height={46} fontSize={12} margin={4} /></div>
          <p className="truncate text-[11px] text-slate-700">{asset.name}</p>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={download}><Download size={14} /> Download PNG</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
