import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Info } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage, money } from "@/lib/procurement";
import { cn } from "@/utils";

const BILLABLE = `status != "cancelled" && status != "rejected"`;
const today = () => new Date().toISOString().slice(0, 10);

type Line = { line: number; description: string; unit: string; ordered: number; received: number; billed: number; quantity: number; unit_price: number; tax_rate: number; po_price: number };

/**
 * Records a supplier bill against a purchase order. Quantities default to "received but not yet billed"
 * and prices to the PO price; the server runs the three-way match and flags any difference.
 */
export default function RecordInvoiceDialog({ po, open, onClose }: { po: any; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [ref, setRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(today());
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [touched, setTouched] = React.useState(false);

  const prior = useQuery(["po-billed", po?.id], () => pocketbase.collection("supplier_invoices").getFullList({ filter: `purchase_order = "${po.id}" && ${BILLABLE}`, fields: "id,items" }), { enabled: open && Boolean(po) });

  React.useEffect(() => {
    if (!open || !prior.data) return;
    const billed: Record<number, number> = {};
    for (const inv of prior.data as any[]) for (const l of inv.items || []) billed[l.line] = (billed[l.line] || 0) + (Number(l.quantity) || 0);
    setLines(
      (po.items || []).map((l: any) => {
        const received = Number(l.received_qty) || 0;
        const poPrice = l.quantity ? Math.round((l.net / l.quantity) * 100) / 100 : l.unit_price;
        return {
          line: l.line, description: l.description, unit: l.unit, ordered: l.quantity, received, billed: billed[l.line] || 0,
          quantity: Math.max(received - (billed[l.line] || 0), 0), unit_price: poPrice, tax_rate: Number(l.tax_rate) || 0, po_price: poPrice,
        };
      })
    );
    setRef("");
    setDup(null);
    setDupReason("");
    setInvoiceDate(today());
    setDueDate("");
    setNotes("");
    setTouched(false);
  }, [open, prior.data, po]);

  const totals = lines.reduce(
    (t, l) => {
      const net = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      return { net: t.net + net, tax: t.tax + (net * (Number(l.tax_rate) || 0)) / 100 };
    },
    { net: 0, tax: 0 }
  );
  const anyQty = lines.some((l) => Number(l.quantity) > 0);
  // Duplicate control (server): same reference refused; same amount within N days needs a reason.
  const [dup, setDup] = React.useState<{ kind: "duplicate_invoice" | "possible_duplicate"; message: string } | null>(null);
  const [dupReason, setDupReason] = React.useState("");

  const save = useMutation(
    () =>
      pocketbase.collection("supplier_invoices").create({
        purchase_order: po.id,
        supplier_invoice_number: ref.trim(),
        invoice_date: `${invoiceDate} 00:00:00.000Z`,
        due_date: dueDate ? `${dueDate} 00:00:00.000Z` : "",
        notes,
        items: lines.filter((l) => Number(l.quantity) > 0).map((l) => ({ line: l.line, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate) })),
        ...(dup?.kind === "possible_duplicate" && dupReason.trim() ? { duplicate_override: dupReason.trim() } : {}),
      }),
    {
      onSuccess: (inv: any) => {
        if (inv.status === "exception") toast.warning(`${inv.number} recorded with a match exception. Review it before approval.`);
        else toast.success(`${inv.number} recorded and matched to ${po.number}`);
        onClose();
        navigate(`/dashboard/finance/invoices/${inv.id}`);
      },
      onError: (e: any) => {
        const code = e?.response?.data?.supplier_invoice_number?.code;
        if (code === "duplicate_invoice" || code === "possible_duplicate") {
          setDup({ kind: code, message: errorMessage(e) });
          return;
        }
        toast.error(errorMessage(e));
      },
    }
  );

  const set = (i: number, k: keyof Line) => (e: React.ChangeEvent<HTMLInputElement>) => setLines((x) => x.map((l, idx) => (idx === i ? { ...l, [k]: e.target.value } : l)));
  const cell = "h-8 px-2 text-right tabular-nums";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl bg-white">
        <DialogHeader>
          <DialogTitle>Record vendor bill · {po?.number}</DialogTitle>
          <DialogDescription>{po?.expand?.supplier?.name} — enter the bill exactly as the supplier issued it. The system matches it against the order and the goods received.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-[12.5px] font-medium text-slate-700">
            Supplier invoice number <span className="text-red-600">*</span>
            <Input className="mt-1" value={ref} onChange={(e) => { setRef(e.target.value); setDup(null); }} onBlur={() => setTouched(true)} placeholder="e.g. FV-2026-0142" aria-invalid={touched && !ref.trim()} />
            {touched && !ref.trim() && <span className="mt-1 block text-[12px] text-red-600">Required — as printed on the supplier's bill.</span>}
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Bill date <span className="text-red-600">*</span>
            <Input type="date" className="mt-1" value={invoiceDate} max={today()} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Due date
            <Input type="date" className="mt-1" value={dueDate} min={invoiceDate} onChange={(e) => setDueDate(e.target.value)} />
            <span className="mt-1 block text-[11.5px] text-slate-500">Leave empty for 30 days after the bill date.</span>
          </label>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="dnr-grid w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Product / service</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Billed before</th>
                <th className="w-28 px-3 py-2 text-right">Bill qty</th>
                <th className="w-36 px-3 py-2 text-right">Unit price</th>
                <th className="w-20 px-3 py-2 text-right">Tax %</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prior.isLoading && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Loading order lines…</td></tr>
              )}
              {lines.map((l, i) => {
                const overReceived = Number(l.quantity) + l.billed > l.received;
                const priceDiff = l.po_price ? ((Number(l.unit_price) - l.po_price) / l.po_price) * 100 : 0;
                return (
                  <tr key={l.line}>
                    <td className="px-3 py-1.5">{l.description}<span className="block text-[11.5px] text-slate-500">{l.unit}</span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.ordered}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.received}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{l.billed}</td>
                    <td className="px-2 py-1.5">
                      <Input type="number" min={0} className={cell} value={l.quantity} onChange={set(i, "quantity")} aria-label={`Line ${l.line} quantity`} />
                      {Number(l.quantity) > 0 && overReceived && <span className="block text-right text-[11px] text-red-600">above received</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" min={0} className={cell} value={l.unit_price} onChange={set(i, "unit_price")} aria-label={`Line ${l.line} unit price`} />
                      {Math.abs(priceDiff) > 0.01 && <span className="block text-right text-[11px] text-amber-700">{priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(1)}% vs PO</span>}
                    </td>
                    <td className="px-2 py-1.5"><Input type="number" min={0} max={100} className={cell} value={l.tax_rate} onChange={set(i, "tax_rate")} aria-label={`Line ${l.line} tax`} /></td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <label className="block flex-1 text-[12.5px] font-medium text-slate-700">
            Notes
            <Textarea className="mt-1 h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
          <dl className="w-full space-y-1 text-[13px] sm:w-72">
            <div className="flex justify-between text-slate-600"><dt>Untaxed amount</dt><dd className="tabular-nums">{money(totals.net, po?.currency)}</dd></div>
            <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd className="tabular-nums">{money(totals.tax, po?.currency)}</dd></div>
            <div className="flex justify-between border-t border-slate-300 pt-1 text-[15px] font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(totals.net + totals.tax, po?.currency)}</dd></div>
          </dl>
        </div>
        <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <Info size={14} className="mt-0.5 shrink-0" /> Differences from the order price or the received quantity are allowed but flagged as a match exception, which must be resolved before the bill can be approved.
        </p>

        {dup && (
          <div role="alert" className={cn("space-y-2 rounded-md border px-3 py-2.5 text-[12.5px]", dup.kind === "duplicate_invoice" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
            <p className="font-medium">{dup.message}</p>
            {dup.kind === "possible_duplicate" && (
              <label className="block">
                Why is this a different invoice? <span className="text-red-600">*</span>
                <Textarea className="mt-1 h-16 bg-white" value={dupReason} onChange={(e) => setDupReason(e.target.value)} placeholder="e.g. Second delivery billed separately; confirmed with the supplier by phone." />
                <span className="mt-1 block text-[11.5px]">At least 15 characters. The bill is recorded as an exception; the Director of Finance must clear it before approval or payment.</span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!ref.trim() || !anyQty || save.isLoading || dup?.kind === "duplicate_invoice" || (dup?.kind === "possible_duplicate" && dupReason.trim().length < 15)}
            onClick={() => save.mutate()}
          >
            {save.isLoading ? "Recording…" : dup?.kind === "possible_duplicate" ? "Record with this reason" : "Record bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
