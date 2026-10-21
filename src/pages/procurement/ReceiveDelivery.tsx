import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Badge } from "@/components/enterprise/ui";
import {
  ButtonLink,
  Card,
  DatePicker,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  Textarea,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { LINE_TYPES, OPEN_PO_STATUSES, errorMessage, money, purchasingApi } from "@/lib/procurement";
import { useRoles } from "@/context/roles.context";

const LIST = "/dashboard/procurement/purchase-orders";

export default function ReceiveDelivery() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string>();
  const [tried, setTried] = React.useState(false);
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
        toast.success(`${r.number} recorded${r.assets.length ? ` · ${r.assets.length} asset record${r.assets.length === 1 ? "" : "s"} created` : ""}`);
        queryClient.invalidateQueries(["purchase_order", po.id]);
        queryClient.invalidateQueries(["record-table"]);
        navigate(`/dashboard/procurement/purchase-orders/${po.id}?tab=receipts`);
      },
      onError: (e) => {
        const m = errorMessage(e);
        setError(m);
        toast.error(m);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    }
  );

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!po) {
    return (
      <Page narrow>
        <Card>
          <EmptyState icon={ShoppingCart} text="This purchase order is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to purchase orders</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  if (!OPEN_PO_STATUSES.includes(po.status)) {
    return (
      <Page narrow>
        <Card>
          <EmptyState
            icon={ShoppingCart}
            text={`${po.number} is ${po.status.replace(/_/g, " ")}, so deliveries can no longer be recorded on it.`}
            action={<ButtonLink to={`${LIST}/${po.id}`} variant="primary">Open {po.number}</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const items: any[] = po.items || [];
  const hasGoods = items.some((l: any) => l.line_type === "goods");
  const allService = items.every((l: any) => l.line_type === "service");
  const cur = po.currency || "RWF";
  const amount = (n: number) => (cur === "RWF" ? fmtMoney(n) : money(n, cur));
  const acceptedValue = items.reduce((a: number, l: any) => {
    const x = lines[l.line] || {};
    const acc = Math.max((Number(x.received) || 0) - (Number(x.rejected) || 0), 0);
    return a + acc * (l.quantity ? l.total / l.quantity : 0);
  }, 0);

  // The same rules the server applies, checked before sending so each message points at its field.
  type LineError = FormError & { short?: string };
  const check = (): LineError[] => {
    const errs: LineError[] = [];
    const entered = items.filter((l) => (Number(lines[l.line]?.received) || 0) > 0);
    if (!entered.length) {
      const first = items.find((l) => l.quantity - (l.received_qty || 0) > 0) || items[0];
      errs.push({ field: `line-${first?.line}-received`, message: "Enter the quantity delivered for at least one line.", short: "Enter a quantity" });
    }
    let over = false;
    for (const l of entered) {
      const x = lines[l.line] || {};
      const received = Number(x.received) || 0;
      const rejected = Number(x.rejected) || 0;
      const accepted = received - rejected;
      const remaining = l.quantity - (l.received_qty || 0);
      const unit = l.unit ? ` ${l.unit}` : "";
      if (rejected < 0) errs.push({ field: `line-${l.line}-rejected`, message: `Line ${l.line}: enter a rejected quantity of 0 or more.`, short: "0 or more" });
      if (rejected > received) errs.push({ field: `line-${l.line}-rejected`, message: `Line ${l.line}: the rejected quantity cannot be more than the ${fmtNumber(received, true)} delivered.`, short: "Too many" });
      if (rejected > 0 && !String(x.rejection_reason || "").trim()) errs.push({ field: `line-${l.line}-reason`, message: `Line ${l.line}: give the reason for the rejected quantity.`, short: "Give the reason" });
      if (accepted > remaining) {
        if (!canOver) errs.push({ field: `line-${l.line}-received`, message: `Line ${l.line}: only ${fmtNumber(remaining, true)}${unit} remain on the order. Someone allowed to authorise over-receipts must accept more.`, short: "More than remains" });
        else over = true;
      }
      if (l.line_type === "asset") {
        const serials = String(x.serial_numbers || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        if (serials.length && serials.length !== accepted) errs.push({ field: `line-${l.line}-serials`, message: `Line ${l.line}: enter one serial number per accepted unit (${fmtNumber(accepted, true)}), or leave it blank.` });
      }
    }
    if (hasGoods && !head.warehouse && entered.some((l) => l.line_type === "goods")) errs.push({ field: "warehouse", message: "Choose the warehouse receiving the goods." });
    if (over && !head.notes.trim()) errs.push({ field: "notes", message: "Explain the over-receipt in the notes: who authorised it and why." });
    return errs;
  };
  const errors = tried ? check() : [];
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const shortFor = (field: string) => {
    const e = errors.find((x) => x.field === field);
    return e ? e.short || e.message : null;
  };
  const isOver = (l: any) => {
    const received = Number(lines[l.line]?.received) || 0;
    return received > 0 && received - (Number(lines[l.line]?.rejected) || 0) > l.quantity - (l.received_qty || 0);
  };
  const summaryErrors: FormError[] = [...errors, ...(error ? [{ message: error }] : [])];
  const now = check();
  const linesEntered = items.filter((l) => (Number(lines[l.line]?.received) || 0) > 0).length;
  const doneIf = (pred: (f?: string) => boolean) => !now.some((e) => pred(e.field));

  const submit = () => {
    setTried(true);
    setError(undefined);
    if (check().length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    receive.mutate();
  };

  const verb = allService ? "Confirm service" : "Record delivery";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", to: "/dashboard/procurement" },
          { label: "Purchase orders", to: LIST },
          { label: po.number, to: `${LIST}/${po.id}` },
          { label: verb },
        ]}
        title={allService ? "Confirm service" : "Goods received note"}
        subtitle={
          <>
            <span className="whitespace-nowrap">{po.number}</span> from {po.expand?.supplier?.name || "the supplier"}: enter what arrived and what you reject.
          </>
        }
      />

      <ErrorSummary errors={summaryErrors} title={errors.length ? "Check these fields before you record the delivery" : "The delivery could not be recorded"} />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <FormBody
          aside={
            <SummaryPanel
              rows={[
                ["Order", <span key="po" className="whitespace-nowrap">{po.number}</span>],
                ["Supplier", po.expand?.supplier?.name || "—"],
                ["Lines delivered", `${fmtNumber(linesEntered)} of ${fmtNumber(items.length)}`],
                ["Accepted value", amount(acceptedValue)],
              ]}
              checklist={[
                ...(hasGoods ? [{ label: "Receiving warehouse", done: doneIf((f) => f === "warehouse") }] : []),
                { label: "Quantity delivered on at least one line", done: linesEntered > 0 && doneIf((f) => Boolean(f?.endsWith("-received"))) },
                { label: "Reasons for rejected items", done: doneIf((f) => Boolean(f?.endsWith("-reason") || f?.endsWith("-rejected"))) },
                ...(items.some((l) => l.line_type === "asset") ? [{ label: "Serial numbers match the units", done: doneIf((f) => Boolean(f?.endsWith("-serials"))) }] : []),
              ]}
            />
          }
        >
          <FormSection title="Delivery" description="Where and when it arrived, and the supplier's delivery note.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {hasGoods && (
                <Field label="Receiving warehouse" required htmlFor="warehouse" error={errorFor("warehouse")} hint={!q.data?.warehouses.length ? "No active warehouse yet. Add one under Inventory › Warehouses." : undefined}>
                  <Select id="warehouse" value={head.warehouse} onChange={(e) => setHead({ ...head, warehouse: e.target.value })} invalid={Boolean(errorFor("warehouse"))}>
                    {!q.data?.warehouses.length && <option value="">No active warehouse</option>}
                    {q.data?.warehouses.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Receipt date" required htmlFor="receipt_date">
                <DatePicker id="receipt_date" value={head.receipt_date} max={new Date().toISOString().slice(0, 10)} onChange={(v) => setHead({ ...head, receipt_date: v })} />
              </Field>
              <Field label="Supplier delivery note number" htmlFor="delivery_note_number">
                <Input id="delivery_note_number" value={head.delivery_note_number} onChange={(e) => setHead({ ...head, delivery_note_number: e.target.value })} placeholder="For example: DN-4471" />
              </Field>
              <Field label="Notes" htmlFor="notes" error={errorFor("notes")} hint={canOver ? "Required when you accept more than was ordered: who authorised it and why." : undefined} className="sm:col-span-2">
                <Textarea id="notes" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} className="min-h-[72px]" invalid={Boolean(errorFor("notes"))} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Quantities received" description="Delivered is everything that arrived; rejected is the part you do not accept.">
            <ol className="divide-y divide-ims-divider rounded-control border border-ims-border">
              {items.map((l: any) => {
                const remaining = l.quantity - (l.received_qty || 0);
                const x = lines[l.line] || {};
                const done = remaining <= 0;
                const extra = Number(x.received) - Number(x.rejected || 0) - remaining;
                const id = (k: string) => `line-${l.line}-${k}`;
                const type = LINE_TYPES[l.line_type];
                return (
                  <li key={l.line} className={cn("grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 px-3 py-4 sm:px-4", done && "bg-ims-thead")}>
                    <span className="pt-0.5 text-t-body font-bold text-ims-muted" aria-hidden>{l.line}</span>
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div className="min-w-0">
                          <p className="font-semibold text-ims-text">{l.description}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-t-small text-ims-muted">
                            {type && <Badge tone={type.tone}>{type.label}</Badge>}
                            <span>{type?.hint}</span>
                          </p>
                        </div>
                        <p className="whitespace-nowrap text-t-small text-ims-muted">
                          {done ? (
                            <span className="font-semibold text-ims-success">Fully received</span>
                          ) : (
                            <>
                              Still to receive <span className="font-bold tabular-nums text-ims-text">{fmtNumber(remaining, true)} {l.unit}</span> of {fmtNumber(l.quantity, true)}
                            </>
                          )}
                        </p>
                      </div>
                      {!done && (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-[128px_128px_150px_minmax(0,1fr)]">
                          <Field
                            label="Delivered"
                            htmlFor={id("received")}
                            error={shortFor(id("received"))}
                            hint={isOver(l) ? <span className={canOver ? "text-ims-warning" : "text-ims-danger"}>{canOver ? `${fmtNumber(extra, true)} over the order` : "More than remains"}</span> : undefined}
                          >
                            <Input id={id("received")} type="number" min={0} step="any" inputMode="decimal" className="text-right tabular-nums" value={x.received ?? ""} onChange={(e) => set(l.line, "received", e.target.value)} invalid={Boolean(errorFor(id("received")))} />
                          </Field>
                          <Field label="Rejected" htmlFor={id("rejected")} error={shortFor(id("rejected"))}>
                            <Input id={id("rejected")} type="number" min={0} step="any" inputMode="decimal" className="text-right tabular-nums" disabled={!Number(x.received)} value={x.rejected ?? ""} onChange={(e) => set(l.line, "rejected", e.target.value)} invalid={Boolean(errorFor(id("rejected")))} />
                          </Field>
                          <Field label="Condition" htmlFor={id("condition")} className="col-span-2 md:col-span-1">
                            <Select id={id("condition")} value={x.condition ?? "good"} onChange={(e) => set(l.line, "condition", e.target.value)}>
                              <option value="good">Good</option>
                              <option value="minor_damage">Minor damage</option>
                              <option value="damaged">Damaged</option>
                            </Select>
                          </Field>
                          <Field label="Rejection reason" required={Boolean(Number(x.rejected))} htmlFor={id("reason")} error={shortFor(id("reason"))} className="col-span-2 md:col-span-1">
                            <Input id={id("reason")} disabled={!Number(x.rejected)} value={x.rejection_reason ?? ""} onChange={(e) => set(l.line, "rejection_reason", e.target.value)} placeholder={Number(x.rejected) ? "For example: broken seal" : "Only when items are rejected"} invalid={Boolean(errorFor(id("reason")))} />
                          </Field>
                          {l.line_type === "goods" && (
                            <>
                              <Field label="Batch" htmlFor={id("batch")}>
                                <Input id={id("batch")} value={x.batch ?? ""} onChange={(e) => set(l.line, "batch", e.target.value)} />
                              </Field>
                              <Field label="Expiry date" htmlFor={id("expiry")} className="md:col-span-2">
                                <DatePicker id={id("expiry")} value={x.expiry_date || ""} onChange={(v) => set(l.line, "expiry_date", v)} placeholder="No expiry" />
                              </Field>
                            </>
                          )}
                          {l.line_type === "asset" && (
                            <Field label="Serial numbers" htmlFor={id("serials")} hint="One per accepted unit, separated by commas or new lines. Leave blank if unknown." error={errorFor(id("serials"))} className="col-span-2 md:col-span-4">
                              <Textarea id={id("serials")} value={x.serial_numbers ?? ""} onChange={(e) => set(l.line, "serial_numbers", e.target.value)} className="min-h-[72px]" invalid={Boolean(errorFor(id("serials")))} />
                            </Field>
                          )}
                          {l.line_type === "service" && <p className="col-span-2 text-t-small text-ims-muted md:col-span-4">Enter the quantity of service delivered to confirm it.</p>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {items.some(isOver) && (
              <p className="flex items-start gap-2 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2.5 text-t-small text-ims-warning">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                {canOver ? "Some lines accept more than was ordered. Explain the over-receipt in the notes." : "Some lines accept more than remains on the order. Someone allowed to authorise over-receipts must record them."}
              </p>
            )}
          </FormSection>
        </FormBody>

        <FormActions
          submitType="submit"
          submitLabel={verb}
          onCancel={() => navigate(-1)}
          busy={receive.isLoading}
          note={<>Accepted value <span className="font-bold tabular-nums text-ims-text">{amount(acceptedValue)}</span></>}
        />
      </form>
    </Page>
  );
}
