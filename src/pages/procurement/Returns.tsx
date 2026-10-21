import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, Plus, Undo2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { Button, Column, DataTable, DocNo, EmptyState, Field, Input, Modal, Num, Page, PageHeader, Select, Textarea, TwoLine, fmtDate, fmtMoney, fmtNumber } from "@/components/ims";
import { RETURN_STATUS, errorMessage, phase5Api } from "@/lib/procurement";
import { ChoiceCards } from "@/components/portal/kit";

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
  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(RETURN_STATUS).map(([value, m]) => ({ value, label: m.note ? `${m.label} · ${m.note}` : m.label })) },
    { field: "supplier", label: "Supplier", collection: "suppliers" },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => fmtDate(r.created), csv: (r) => r.number },
    {
      key: "supplier",
      header: "Supplier",
      className: "max-w-[220px]",
      clamp: true,
      cell: (r) => r.expand?.supplier?.name || "—",
      sub: (r) => r.expand?.purchase_order?.number,
      csv: (r) => r.expand?.supplier?.name || "",
    },
    { key: "po", header: "Purchase order", exportOnly: true, cell: (r) => r.expand?.purchase_order?.number || "—", csv: (r) => r.expand?.purchase_order?.number || "" },
    { key: "grn", header: "Goods receipt", nowrap: true, cell: (r) => <DocNo value={r.expand?.goods_receipt?.number} />, csv: (r) => r.expand?.goods_receipt?.number || "" },
    { key: "reason", header: "Reason", clamp: true, cell: (r) => r.reason || "—", csv: (r) => r.reason || "" },
    { key: "value", header: "Value (RWF)", sortField: "total_value", align: "right", sum: "total_value", format: "money", cell: (r) => <Num value={r.total_value} />, csv: (r) => r.total_value },
    { key: "credit", header: "Credit note (RWF)", align: "right", sum: "credit_amount", format: "money", cell: (r) => (r.credit_amount ? <Num value={r.credit_amount} /> : <span className="text-ims-faint">—</span>), csv: (r) => r.credit_amount },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={RETURN_STATUS} />, csv: (r) => RETURN_STATUS[r.status]?.label },
    { key: "date", header: "Date", sortField: "created", exportOnly: true, cell: (r) => fmtDate(r.created), csv: (r) => r.created?.slice(0, 10) },
  ];
  const canCreate = canPerform("receive_goods") || canPerform("manage_purchase_orders");
  const open = (r: any) => navigate(`/dashboard/procurement/returns/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Purchase returns" }]}
        title="Purchase returns"
        subtitle="Goods sent back to suppliers, from approval to dispatch and the credit note."
        primary={canCreate ? { label: "New return", icon: Plus, onClick: () => setCreating(true) } : undefined}
      />
      <RecordTable
        collection="purchase_returns"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reason", "supplier.name", "purchase_order.number", "credit_note_number"]}
        searchPlaceholder="Search number, reason, supplier or PO"
        filters={filters}
        dateField="created"
        dateLabel="Date"
        expand="supplier,purchase_order,goods_receipt"
        defaultSort="-created"
        exportName="purchase-returns"
        exportTitle="Purchase returns"
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: Undo2,
          title: "No purchase returns",
          text: "No purchase returns yet. Return defective or wrong goods from a goods receipt; the return is approved before the goods leave the warehouse.",
          action: canCreate ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New return</Button> : undefined,
        }}
      />
      {creating && <ReturnFormDialog onClose={() => setCreating(false)} />}
    </Page>
  );
}

const CONDITIONS = [
  { value: "defective", label: "Defective" },
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "expired", label: "Expired" },
  { value: "excess", label: "Excess quantity" },
];

/** Numbered block inside a dialog: "1 · Delivery". */
function DialogSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-ims-divider pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[15px] font-bold text-ims-text">
        {n}<span className="px-1.5 text-ims-faint">·</span>{title}
      </h3>
      {children}
    </section>
  );
}

/** New return from a goods receipt. */
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
    grn: !grn && "Choose the goods receipt the goods came in.",
    lines: !chosen.length ? "Enter the quantity to return for at least one item." : chosen.some((l) => Number(qty[l.line]) > l.accepted - (done[l.line] || 0)) ? "A quantity is more than what can still be returned. Lower it to the number under “Can return”." : false,
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
  const submit = () => {
    setTried(true);
    if (!Object.values(errors).some(Boolean)) save.mutate();
  };

  const lineColumns: Column<any>[] = [
    { key: "item", header: "Item", cell: (l) => <TwoLine main={l.description} sub={`${l.unit || ""}${l.batch ? ` · batch ${l.batch}` : ""}`} /> },
    { key: "accepted", header: "Accepted", numeric: true, cell: (l) => fmtNumber(l.accepted, true) },
    { key: "can", header: "Can return", numeric: true, cell: (l) => <span className="text-ims-body">{fmtNumber(l.accepted - (done[l.line] || 0), true)}</span> },
    {
      key: "qty",
      header: "Return quantity",
      width: "130px",
      cell: (l) => {
        const can = l.accepted - (done[l.line] || 0);
        const bad = Number(qty[l.line]) > can;
        return (
          <Input
            type="number"
            min={0}
            max={can}
            step="any"
            inputMode="decimal"
            className="h-9 text-right tabular-nums"
            invalid={bad}
            value={qty[l.line] || ""}
            onChange={(e) => setQty((x) => ({ ...x, [l.line]: e.target.value }))}
            disabled={can <= 0}
            aria-label={`Return quantity for ${l.description}`}
          />
        );
      },
    },
    {
      key: "condition",
      header: "Condition",
      width: "170px",
      cell: (l) => (
        <Select className="h-9" value={cond[l.line] || "defective"} onChange={(e) => setCond((x) => ({ ...x, [l.line]: e.target.value }))} aria-label={`Condition of ${l.description}`}>
          {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      ),
    },
    {
      key: "value",
      header: "Value (RWF)",
      numeric: true,
      cell: (l) => (Number(qty[l.line]) > 0 ? <Num value={Number(qty[l.line]) * (l.unit_cost || 0)} /> : <span className="text-ims-faint">—</span>),
      total: <Num value={total} />,
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Return goods to a supplier"
      description="Goods leave the warehouse only after the return is approved."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} onClick={submit}>Submit for approval</Button>
        </>
      }
    >
      <DialogSection n={1} title="Delivery">
        <Field label="Goods receipt" required htmlFor="ret-grn" error={tried && errors.grn}>
          <Select id="ret-grn" invalid={Boolean(tried && errors.grn)} value={grn} onChange={(e) => { setGrn(e.target.value); setQty({}); }} disabled={Boolean(grnId)}>
            <option value="">{receipts.isLoading ? "Loading…" : "Choose the delivery the goods came in"}</option>
            {(receipts.data || []).map((g: any) => <option key={g.id} value={g.id}>{g.number} · {g.expand?.supplier?.name} · {g.expand?.purchase_order?.number} · {fmtDate(g.receipt_date)}</option>)}
          </Select>
        </Field>
        {selected && (
          <p className="rounded-control bg-ims-subtle px-3 py-2 text-t-small text-ims-body">
            Supplier <span className="font-semibold text-ims-text">{selected.expand?.supplier?.name}</span> · warehouse <span className="font-semibold text-ims-text">{selected.expand?.warehouse?.name || "—"}</span>
          </p>
        )}
      </DialogSection>

      {selected && (
        <DialogSection n={2} title="Items to return">
          <div className="overflow-hidden rounded-card border border-ims-border">
            <DataTable
              columns={lineColumns}
              rows={lines}
              rowKey={(l) => String(l.line)}
              minWidth={720}
              caption="Items to return"
              totalLabel="Total to return"
              empty={<EmptyState compact text="No accepted goods on this receipt can be returned." />}
            />
          </div>
          {tried && errors.lines && <p className="text-t-hint text-ims-danger" role="alert">{errors.lines}</p>}
        </DialogSection>
      )}

      <DialogSection n={selected ? 3 : 2} title="Reason and settlement">
        <Field label="Why are the goods returned?" required htmlFor="ret-reason" error={tried && errors.reason}>
          <Textarea id="ret-reason" rows={3} invalid={Boolean(tried && errors.reason)} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2 toner cartridges leak and do not print; confirmed by the ICT officer" />
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
        <Field label="Notes" htmlFor="ret-notes" hint={total ? `Value returned: ${fmtMoney(total)}` : undefined}>
          <Input id="ret-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </DialogSection>
    </Modal>
  );
}
