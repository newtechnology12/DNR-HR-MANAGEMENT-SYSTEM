import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import { Totals } from "@/components/enterprise/DocumentLayout";
import { Button, Column, DataTable, DatePicker, EmptyState, Field, Input, Modal, ModalSection, Num, Textarea, fmtMoney, fmtNumber } from "@/components/ims";
import { errorMessage, money } from "@/lib/procurement";

const BILLABLE = `status != "cancelled" && status != "rejected"`;
const today = () => new Date().toISOString().slice(0, 10);

type Line = { line: number; description: string; unit: string; ordered: number; received: number; billed: number; quantity: number; unit_price: number; tax_rate: number; po_price: number };

/**
 * Records a supplier invoice against a purchase order. Quantities default to "received but not yet
 * invoiced" and prices to the PO price; the server runs the three-way match and flags any difference.
 */
export default function RecordInvoiceDialog({ po, open, onClose }: { po: any; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [ref, setRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(today());
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [touched, setTouched] = React.useState(false);
  const [tried, setTried] = React.useState(false);

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
    setTried(false);
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
          setTried(false);
          return;
        }
        toast.error(errorMessage(e));
      },
    }
  );

  const set = (i: number, k: keyof Line) => (e: React.ChangeEvent<HTMLInputElement>) => setLines((x) => x.map((l, idx) => (idx === i ? { ...l, [k]: e.target.value } : l)));
  const cur = po?.currency || "RWF";
  const amount = (n: number) => (cur === "RWF" ? fmtMoney(n) : money(n, cur));

  const refMissing = !ref.trim();
  const dupShort = dup?.kind === "possible_duplicate" && dupReason.trim().length < 15;
  const blocked = dup?.kind === "duplicate_invoice";
  const record = () => {
    setTried(true);
    setTouched(true);
    if (refMissing || !anyQty || blocked || dupShort) return;
    save.mutate();
  };

  const columns: Column<Line>[] = [
    { key: "description", header: "Item or service", clamp: true, cell: (l) => l.description, sub: (l) => l.unit },
    { key: "ordered", header: "Ordered", numeric: true, cell: (l) => fmtNumber(l.ordered, true) },
    { key: "received", header: "Received", numeric: true, cell: (l) => fmtNumber(l.received, true) },
    { key: "billed", header: "Invoiced before", numeric: true, cell: (l) => <span className="text-ims-muted">{fmtNumber(l.billed, true)}</span> },
    {
      key: "quantity",
      header: "Invoice quantity",
      width: "128px",
      cell: (l, i) => {
        const over = Number(l.quantity) > 0 && Number(l.quantity) + l.billed > l.received;
        return (
          <>
            <Input type="number" min={0} step="any" inputMode="decimal" className="h-9 text-right tabular-nums" value={l.quantity} onChange={set(i, "quantity")} aria-label={`Line ${l.line} quantity`} invalid={over} />
            {over && <span className="mt-0.5 block text-right text-t-hint text-ims-danger">Above received</span>}
          </>
        );
      },
    },
    {
      key: "unit_price",
      header: `Unit price (${cur})`,
      width: "150px",
      cell: (l, i) => {
        const diff = l.po_price ? ((Number(l.unit_price) - l.po_price) / l.po_price) * 100 : 0;
        return (
          <>
            <Input type="number" min={0} step="any" inputMode="decimal" className="h-9 text-right tabular-nums" value={l.unit_price} onChange={set(i, "unit_price")} aria-label={`Line ${l.line} unit price`} />
            {Math.abs(diff) > 0.01 && <span className="mt-0.5 block text-right text-t-hint text-ims-warning">{diff > 0 ? "+" : ""}{diff.toFixed(1)}% against the order</span>}
          </>
        );
      },
    },
    {
      key: "tax",
      header: "Tax (%)",
      width: "88px",
      cell: (l, i) => <Input type="number" min={0} max={100} step="any" inputMode="decimal" className="h-9 text-right tabular-nums" value={l.tax_rate} onChange={set(i, "tax_rate")} aria-label={`Line ${l.line} tax`} />,
    },
    {
      key: "subtotal",
      header: `Subtotal (${cur})`,
      numeric: true,
      cell: (l) => <span className="font-semibold"><Num value={Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))} /></span>,
      total: <Num value={Math.round(totals.net)} />,
    },
  ];

  return (
    <Modal
      open={open}
      onClose={save.isLoading ? () => undefined : onClose}
      size="xl"
      title={<>Record a supplier invoice for <span className="whitespace-nowrap">{po?.number}</span></>}
      description={`${po?.expand?.supplier?.name ? `${po.expand.supplier.name}. ` : ""}Enter the invoice exactly as the supplier issued it. It is matched against the order and the goods received.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" onClick={record} loading={save.isLoading} disabled={blocked}>
            {dup?.kind === "possible_duplicate" ? "Record with this reason" : "Record invoice"}
          </Button>
        </>
      }
    >
      <ModalSection title="Invoice">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Supplier invoice number" required htmlFor="inv-ref" error={touched && refMissing ? "Enter the number printed on the supplier's invoice." : null}>
            <Input id="inv-ref" value={ref} onChange={(e) => { setRef(e.target.value); setDup(null); }} onBlur={() => setTouched(true)} placeholder="For example: FV-2026-0142" invalid={touched && refMissing} />
          </Field>
          <Field label="Invoice date" required htmlFor="inv-date">
            <DatePicker id="inv-date" value={invoiceDate} max={today()} onChange={setInvoiceDate} />
          </Field>
          <Field label="Due date" htmlFor="inv-due" hint={dueDate ? <button type="button" onClick={() => setDueDate("")} className="font-semibold text-ims-link hover:underline">Clear: 30 days after the invoice date</button> : "Leave empty for 30 days after the invoice date."}>
            <DatePicker id="inv-due" value={dueDate} min={invoiceDate} onChange={setDueDate} placeholder="30 days after the invoice" />
          </Field>
        </div>
      </ModalSection>

      <ModalSection title="Items" description="Quantities start at what was received and not yet invoiced; prices at the order price.">
        <div className="overflow-hidden rounded-control border border-ims-border">
          <DataTable
            columns={columns}
            rows={lines}
            rowKey={(l) => String(l.line)}
            loading={prior.isLoading}
            error={prior.isError ? prior.error : undefined}
            onRetry={() => prior.refetch()}
            minWidth={900}
            caption="Invoice items"
            empty={<EmptyState compact text="This order has no items to invoice." />}
          />
        </div>
        {tried && !anyQty && (
          <p role="alert" className="flex items-start gap-1 text-t-hint text-ims-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden /> Enter a quantity above 0 on at least one line.
          </p>
        )}
      </ModalSection>

      <ModalSection title="Notes and total">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Field label="Notes" htmlFor="inv-notes" className="flex-1">
            <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[72px]" />
          </Field>
          <div className="w-full sm:w-80 [&>dl]:mt-0">
            <Totals rows={[["Untaxed amount", amount(totals.net)], ["Tax", amount(totals.tax)]]} total={["Total", amount(totals.net + totals.tax)]} />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-control bg-ims-subtle px-3 py-2.5 text-t-small text-ims-body">
          <Info size={15} className="mt-0.5 shrink-0 text-ims-muted" aria-hidden />
          Differences from the order price or the received quantity are allowed but flagged as a match exception, which must be resolved before the invoice can be approved.
        </p>
      </ModalSection>

      {dup && (
        <div role="alert" className={cn("space-y-3 rounded-card border px-4 py-3 text-t-body", dup.kind === "duplicate_invoice" ? "border-ims-danger/30 bg-ims-danger-bg text-ims-danger" : "border-ims-warning/30 bg-ims-warning-bg text-ims-warning")}>
          <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {dup.message}</p>
          {dup.kind === "possible_duplicate" && (
            <Field
              label="Why is this a different invoice?"
              required
              htmlFor="inv-dup-reason"
              error={tried && dupShort ? "Write at least 15 characters." : null}
              hint="The invoice is recorded as an exception; the Director of Finance must clear it before approval or payment."
            >
              <Textarea id="inv-dup-reason" className="min-h-[72px]" value={dupReason} onChange={(e) => setDupReason(e.target.value)} invalid={tried && dupShort} placeholder="For example: second delivery invoiced separately, confirmed with the supplier by phone" />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
