import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, PackageCheck } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Badge, PageHeader, Panel } from "@/components/enterprise/ui";
import { LINE_TYPES, OPEN_PO_STATUSES, errorMessage, money, purchasingApi } from "@/lib/procurement";
import { useRoles } from "@/context/roles.context";

const inputCls = "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function ReceiveDelivery() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string>();
  const q = useQuery(["receive", poId], async () => {
    const [po, warehouses] = await Promise.all([
      pocketbase.collection("purchase_orders").getOne(poId!, { expand: "supplier" }),
      pocketbase.collection("warehouses").getFullList({ filter: "active = true", sort: "name" }),
    ]);
    return { po, warehouses };
  });
  const po: any = q.data?.po;
  const { canPerform } = useRoles();
  const canOver = canPerform("authorize_over_receipt");
  const [head, setHead] = React.useState({ warehouse: "", delivery_note_number: "", receipt_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [lines, setLines] = React.useState<Record<number, any>>({});
  React.useEffect(() => {
    if (!po) return;
    setLines(Object.fromEntries((po.items || []).map((l: any) => [l.line, { received: "", rejected: "", rejection_reason: "", condition: "good", batch: "", expiry_date: "", serial_numbers: "" }])));
    if (q.data?.warehouses[0]) setHead((h) => ({ ...h, warehouse: h.warehouse || q.data!.warehouses[0].id }));
  }, [po?.id]);
  const set = (line: number, k: string, v: string) => setLines((x) => ({ ...x, [line]: { ...x[line], [k]: v } }));

  const receive = useMutation(
    () =>
      purchasingApi.receive(po.id, {
        ...head,
        receipt_date: `${head.receipt_date} 12:00:00.000Z`,
        items: (po.items || [])
          .map((l: any) => ({ line: l.line, ...lines[l.line], received: Number(lines[l.line]?.received) || 0, rejected: Number(lines[l.line]?.rejected) || 0, serial_numbers: String(lines[l.line]?.serial_numbers || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean) }))
          .filter((l: any) => l.received > 0),
      }),
    {
      onSuccess: (r) => {
        toast.success(`${r.number} recorded${r.assets.length ? ` · ${r.assets.length} asset record(s) created` : ""}`);
        queryClient.invalidateQueries(["purchase_order", po.id]);
        queryClient.invalidateQueries(["record-table"]);
        navigate(`/dashboard/procurement/purchase-orders/${po.id}?tab=receipts`);
      },
      onError: (e) => {
        const m = errorMessage(e);
        setError(m);
        toast.error(m);
      },
    }
  );

  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (!po) return null;
  if (!OPEN_PO_STATUSES.includes(po.status)) {
    return <div className="px-4 py-4 sm:px-6"><Panel><p className="text-[13px] text-slate-600">{po.number} is {po.status.replace(/_/g, " ")}; deliveries cannot be recorded.</p></Panel></div>;
  }
  const hasGoods = (po.items || []).some((l: any) => l.line_type === "goods");
  const allService = (po.items || []).every((l: any) => l.line_type === "service");
  const acceptedValue = (po.items || []).reduce((a: number, l: any) => {
    const x = lines[l.line] || {};
    const acc = Math.max((Number(x.received) || 0) - (Number(x.rejected) || 0), 0);
    return a + acc * (l.quantity ? l.total / l.quantity : 0);
  }, 0);

  return (
    <form className="space-y-4 px-4 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); setError(undefined); receive.mutate(); }}>
      <PageHeader
        title={`${allService ? "Confirm service" : "Receive delivery"} · ${po.number}`}
        description={`${po.expand?.supplier?.name} · enter what physically arrived. Rejected items are recorded with a reason and are not taken into stock.`}
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Purchase orders", link: "/dashboard/procurement/purchase-orders" }, { title: po.number, link: `/dashboard/procurement/purchase-orders/${po.id}` }, { title: "Receive", link: "#" }]}
      />
      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}

      <Panel title="Delivery">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {hasGoods && (
            <label className="block text-[12.5px] font-medium text-slate-700">Receiving warehouse <span className="text-red-600">*</span>
              <select className={cn(inputCls, "mt-1")} value={head.warehouse} onChange={(e) => setHead({ ...head, warehouse: e.target.value })}>
                {!q.data?.warehouses.length && <option value="">No active warehouse — create one under Inventory</option>}
                {q.data?.warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          <label className="block text-[12.5px] font-medium text-slate-700">Receipt date<input type="date" className={cn(inputCls, "mt-1")} value={head.receipt_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setHead({ ...head, receipt_date: e.target.value })} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Supplier delivery note no.<input className={cn(inputCls, "mt-1")} value={head.delivery_note_number} onChange={(e) => setHead({ ...head, delivery_note_number: e.target.value })} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Notes<input className={cn(inputCls, "mt-1")} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} /></label>
        </div>
      </Panel>

      <Panel title="Lines" subtitle="Delivered = everything that arrived; rejected = the part not accepted" bodyClassName="px-0">
        <div className="overflow-x-auto">
          <table className="dnr-grid w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2">Item</th><th className="px-2 py-2 text-right">Remaining</th><th className="w-24 px-2 py-2">Delivered</th><th className="w-24 px-2 py-2">Rejected</th><th className="w-44 px-2 py-2">Rejection reason</th><th className="w-28 px-2 py-2">Condition</th><th className="px-2 py-2">Batch / expiry / serials</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {(po.items || []).map((l: any) => {
                const remaining = l.quantity - (l.received_qty || 0);
                const x = lines[l.line] || {};
                const done = remaining <= 0;
                return (
                  <tr key={l.line} className={cn(done && "opacity-50")}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{l.description}</p>
                      <p className="text-[12px] text-slate-500"><Badge tone={LINE_TYPES[l.line_type]?.tone}>{LINE_TYPES[l.line_type]?.label}</Badge> <span className="ml-1">{LINE_TYPES[l.line_type]?.hint}</span></p>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{remaining} {l.unit}</td>
                    <td className="px-2 py-2"><input type="number" min={0} step="any" disabled={done} className={inputCls} value={x.received} onChange={(e) => set(l.line, "received", e.target.value)} aria-label={`Line ${l.line} delivered`} />
                      {Number(x.received) - Number(x.rejected || 0) > remaining && <span className={cn("mt-1 block text-[11px] leading-tight", canOver ? "text-amber-700" : "text-red-600")}>{canOver ? `Over-receipt +${Number(x.received) - Number(x.rejected || 0) - remaining}: explain in the notes` : "More than remaining — needs authorisation"}</span>}
                    </td>
                    <td className="px-2 py-2"><input type="number" min={0} step="any" disabled={done || !Number(x.received)} className={inputCls} value={x.rejected} onChange={(e) => set(l.line, "rejected", e.target.value)} aria-label={`Line ${l.line} rejected`} /></td>
                    <td className="px-2 py-2"><input disabled={!Number(x.rejected)} className={inputCls} value={x.rejection_reason} onChange={(e) => set(l.line, "rejection_reason", e.target.value)} placeholder={Number(x.rejected) ? "Required" : ""} aria-label={`Line ${l.line} rejection reason`} /></td>
                    <td className="px-2 py-2">
                      <select disabled={done} className={inputCls} value={x.condition} onChange={(e) => set(l.line, "condition", e.target.value)} aria-label={`Line ${l.line} condition`}>
                        <option value="good">Good</option><option value="minor_damage">Minor damage</option><option value="damaged">Damaged</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      {l.line_type === "goods" && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <input disabled={done} className={inputCls} value={x.batch} onChange={(e) => set(l.line, "batch", e.target.value)} placeholder="Batch" aria-label={`Line ${l.line} batch`} />
                          <input type="date" disabled={done} className={inputCls} value={x.expiry_date} onChange={(e) => set(l.line, "expiry_date", e.target.value)} aria-label={`Line ${l.line} expiry`} />
                        </div>
                      )}
                      {l.line_type === "asset" && (
                        <textarea disabled={done} className={cn(inputCls, "h-16 py-1.5")} value={x.serial_numbers} onChange={(e) => set(l.line, "serial_numbers", e.target.value)} placeholder="Serial numbers, one per accepted unit (comma or new line)" aria-label={`Line ${l.line} serial numbers`} />
                      )}
                      {l.line_type === "service" && <p className="pt-2 text-[12px] text-slate-500">Enter the quantity of service delivered to confirm it.</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-[13px] text-slate-600">Accepted value: <span className="font-semibold tabular-nums text-slate-900">{money(acceptedValue, po.currency)}</span></p>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" disabled={receive.isLoading}><PackageCheck size={15} /> {receive.isLoading ? "Recording…" : allService ? "Confirm service" : "Record receipt"}</Button>
      </div>
    </form>
  );
}
