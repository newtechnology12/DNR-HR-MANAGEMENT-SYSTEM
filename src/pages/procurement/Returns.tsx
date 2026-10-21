import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ClipboardList, PackageX, Plus, Truck, Undo2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { RETURN_STATUS, errorMessage, money, phase5Api } from "@/lib/procurement";
import { ChoiceCards, Field, FormBlock, FormDialog, inputCls, showDate, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

export default function Returns() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [creating, setCreating] = React.useState(false);
  const view = params.get("view") || "all";
  const views: RecordView[] = [
    { key: "all", label: "All returns" },
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "dispatch", label: "To dispatch", filter: `status = "approved"` },
    { key: "credit", label: "Awaiting credit note", filter: `status = "dispatched"` },
    { key: "credited", label: "Credited", filter: `status = "credited"` },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Return", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    { key: "date", header: "Date", sortField: "created", cell: (r) => <span className="whitespace-nowrap text-slate-600">{showDate(r.created)}</span>, csv: (r) => r.created?.slice(0, 10) },
    { key: "supplier", header: "Supplier", cell: (r) => r.expand?.supplier?.name, csv: (r) => r.expand?.supplier?.name },
    { key: "po", header: "PO / receipt", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.purchase_order?.number} · {r.expand?.goods_receipt?.number}</span>, csv: (r) => r.expand?.purchase_order?.number },
    { key: "reason", header: "Reason", className: "max-w-[280px]", cell: (r) => <span className="line-clamp-1 text-slate-600">{r.reason}</span>, csv: (r) => r.reason },
    { key: "value", header: "Value", sortField: "total_value", align: "right", cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{money(r.total_value)}</span>, csv: (r) => r.total_value },
    { key: "credit", header: "Credit note", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{r.credit_amount ? money(r.credit_amount) : "—"}</span>, csv: (r) => r.credit_amount },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={RETURN_STATUS} />, csv: (r) => RETURN_STATUS[r.status]?.label },
  ];
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Purchase returns"
        description="Goods sent back to suppliers after acceptance: approved, dispatched from the warehouse (stock reduced) and settled by a credit note or replacement."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Returns", link: "/dashboard/procurement/returns" }]}
        actions={(canPerform("receive_goods") || canPerform("manage_purchase_orders")) && <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> New return</Button>}
      />
      <RecordTable
        collection="purchase_returns"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reason", "supplier.name", "purchase_order.number", "credit_note_number"]}
        expand="supplier,purchase_order,goods_receipt"
        defaultSort="-created"
        exportName="purchase-returns"
        onRowClick={(r) => navigate(`/dashboard/procurement/returns/${r.id}`)}
        empty={{ icon: Undo2, title: "No purchase returns", text: "Return defective or wrong goods from a goods receipt; the return is approved before the goods leave the warehouse." }}
      />
      {creating && <ReturnFormDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

const CONDITIONS = [
  { value: "defective", label: "Defective" },
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "expired", label: "Expired" },
  { value: "excess", label: "Excess quantity" },
];

/** New return from a goods receipt — same form design as the leave request. */
export function ReturnFormDialog({ onClose, grnId }: { onClose: () => void; grnId?: string }) {
  const navigate = useNavigate();
  const [grn, setGrn] = React.useState(grnId || "");
  const [qty, setQty] = React.useState<Record<number, string>>({});
  const [cond, setCond] = React.useState<Record<number, string>>({});
  const [reason, setReason] = React.useState("");
  const [action, setAction] = React.useState<"credit_note" | "replacement" | "refund">("credit_note");
  const [notes, setNotes] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const receipts = useQuery(["returnable-grns"], () => pocketbase.collection("goods_receipts").getList(1, 100, { sort: "-receipt_date", expand: "purchase_order,supplier,warehouse" }).then((r) => r.items.filter((g: any) => (g.items || []).some((i: any) => i.line_type === "goods" && i.accepted > 0))));
  const selected: any = (receipts.data || []).find((g: any) => g.id === grn);
  const returned = useQuery(["grn-returned", grn], () => pocketbase.collection("purchase_returns").getFullList({ filter: `goods_receipt = "${grn}" && status != "cancelled" && status != "rejected"` }), { enabled: Boolean(grn) });
  const done: Record<number, number> = {};
  for (const r of (returned.data || []) as any[]) for (const it of r.items || []) done[it.line] = (done[it.line] || 0) + it.quantity;
  const lines = ((selected?.items || []) as any[]).filter((i) => i.line_type === "goods" && i.accepted > 0);
  const chosen = lines.filter((l) => Number(qty[l.line]) > 0);
  const total = chosen.reduce((a, l) => a + Number(qty[l.line]) * (l.unit_cost || 0), 0);
  const errors = {
    grn: !grn && "Choose the goods receipt.",
    lines: !chosen.length ? "Enter the quantity to return for at least one item." : chosen.some((l) => Number(qty[l.line]) > l.accepted - (done[l.line] || 0)) ? "A quantity is more than what can still be returned." : false,
    reason: reason.trim().length < 10 && "Explain why the goods are returned (at least 10 characters).",
  };
  const save = useMutation(
    async () => {
      const r = await phase5Api.createReturn({ goods_receipt: grn, reason, supplier_action: action, notes, items: chosen.map((l) => ({ line: l.line, quantity: Number(qty[l.line]), condition: cond[l.line] || "defective" })) });
      await phase5Api.returnAction(r.id, "submit");
      return r;
    },
    {
      onSuccess: (r) => {
        toast.success(`${r.number} sent for approval`);
        navigate(`/dashboard/procurement/returns/${r.id}`);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={PackageX}
      title="Return goods to a supplier"
      description={<>Goods leave the warehouse only after approval. <span className="text-red-600">*</span> required</>}
      submitLabel={`Send for approval${total ? ` · ${money(total)}` : ""}`}
      busy={save.isLoading}
      wide
      onSubmit={() => {
        setTried(true);
        if (!Object.values(errors).some(Boolean)) save.mutate();
      }}
    >
      <FormBlock icon={Truck} title="Delivery">
        <Field label="Goods receipt" required error={tried && errors.grn}>
          <select className={inputCls} value={grn} onChange={(e) => { setGrn(e.target.value); setQty({}); }} disabled={Boolean(grnId)}>
            <option value="">{receipts.isLoading ? "Loading…" : "Choose the delivery the goods came in"}</option>
            {(receipts.data || []).map((g: any) => <option key={g.id} value={g.id}>{g.number} · {g.expand?.supplier?.name} · {g.expand?.purchase_order?.number} · {showDate(g.receipt_date)}</option>)}
          </select>
        </Field>
        {selected && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">Supplier <span className="font-medium text-slate-800">{selected.expand?.supplier?.name}</span> · warehouse <span className="font-medium text-slate-800">{selected.expand?.warehouse?.name || "—"}</span></p>}
      </FormBlock>

      {selected && (
        <FormBlock icon={ClipboardList} title="Items to return *">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="dnr-grid w-full min-w-[620px] text-[13px]">
              <thead><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Accepted</th><th className="px-3 py-2 text-right">Can return</th><th className="w-28 px-3 py-2 text-right">Return qty</th><th className="w-40 px-3 py-2">Condition</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => {
                  const can = l.accepted - (done[l.line] || 0);
                  const bad = Number(qty[l.line]) > can;
                  return (
                    <tr key={l.line}>
                      <td className="px-3 py-2">{l.description}<span className="block text-[11.5px] text-slate-500">{l.unit}{l.batch ? ` · batch ${l.batch}` : ""}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.accepted}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{can}</td>
                      <td className="px-2 py-1.5"><input type="number" min={0} max={can} step="any" inputMode="decimal" className={cn(inputCls, "h-9 text-right", bad && "border-red-400")} value={qty[l.line] || ""} onChange={(e) => setQty((x) => ({ ...x, [l.line]: e.target.value }))} disabled={can <= 0} aria-label={`Return quantity ${l.description}`} /></td>
                      <td className="px-2 py-1.5"><select className={cn(inputCls, "h-9")} value={cond[l.line] || "defective"} onChange={(e) => setCond((x) => ({ ...x, [l.line]: e.target.value }))}>{CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(qty[l.line]) > 0 ? money(Number(qty[l.line]) * (l.unit_cost || 0)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tried && errors.lines && <p className="text-[12px] text-red-600">{errors.lines}</p>}
        </FormBlock>
      )}

      <FormBlock icon={Undo2} title="Reason and settlement">
        <Field label="Why are the goods returned?" required error={tried && errors.reason}>
          <textarea className={textareaCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2 toner cartridges leak and do not print; confirmed by the ICT officer" />
        </Field>
        <Field label="What should the supplier do?">
          <ChoiceCards
            value={action}
            onChange={(v) => setAction(v as typeof action)}
            columns={3}
            options={[
              { value: "credit_note", label: "Credit note", description: "Amount deducted from what we owe" },
              { value: "replacement", label: "Replacement", description: "Supplier delivers again" },
              { value: "refund", label: "Refund", description: "Supplier pays the money back" },
            ]}
          />
        </Field>
        <Field label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
      </FormBlock>
    </FormDialog>
  );
}
