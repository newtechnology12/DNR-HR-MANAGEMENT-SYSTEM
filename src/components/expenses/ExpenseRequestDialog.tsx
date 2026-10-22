/**
 * Ask to be reimbursed for an expense, or for a salary advance — or correct a returned request and send it again.
 * The request goes to the head of department, then the Director of Finance; the Cashier pays it.
 *
 *   <ExpenseRequestDialog open onClose={…} onSaved={(r) => …} />            new request
 *   <ExpenseRequestDialog open request={record} onClose={…} onSaved={…} />  a returned request
 */
import * as React from "react";
import { useQuery } from "react-query";
import { Paperclip, X } from "lucide-react";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { EXPENSE_KIND, ExpenseCategory, MOMO_RE, PAY_BY, expensesApi } from "@/lib/expenses";
import { Button, DatePicker, ErrorSummary, Field, FormError, Input, Modal, MoneyInput, Select, Textarea, fmtMoney, notify } from "@/components/ims";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx";

export default function ExpenseRequestDialog({
  open,
  onClose,
  onSaved,
  request,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (r: { id: string; number: string }) => void;
  /** A returned request to correct. */
  request?: any;
}) {
  const { user } = useAuth();
  const cats = useQuery(["expense-categories"], expensesApi.categories, { enabled: open, staleTime: 300_000 });
  const [v, setV] = React.useState({ category: "", amount: "" as number | "", date: today(), description: "", pay_by: "mobile_money", momoNumber: "", momoName: "" });
  const [files, setFiles] = React.useState<File[]>([]);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setErrors([]);
    setFiles([]);
    setV(
      request
        ? { category: request.expenseCategory, amount: Math.round(request.amount) || "", date: String(request.date || "").slice(0, 10) || today(), description: request.description || "", pay_by: request.pay_by || "mobile_money", momoNumber: request.momoNumber || "", momoName: request.momoName || "" }
        : { category: "", amount: "", date: today(), description: "", pay_by: "mobile_money", momoNumber: String((user as any)?.phone || "").replace(/\s+/g, ""), momoName: (user as any)?.names || (user as any)?.name || "" }
    );
  }, [open, request, user]);

  const list = (cats.data || []) as ExpenseCategory[];
  const cat = list.find((c) => c.id === v.category);
  const advance = cat?.kind === "advance";
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));

  const check = () => {
    const out: FormError[] = [];
    if (!v.category) out.push({ field: "exp-category", message: "Choose what the money is for" });
    if (!v.amount) out.push({ field: "exp-amount", message: "Enter the amount" });
    else if (cat?.max_amount && Number(v.amount) > cat.max_amount) out.push({ field: "exp-amount", message: `${cat.name}: at most ${fmtMoney(cat.max_amount)} per request` });
    if (!v.date) out.push({ field: "exp-date", message: "Give the date" });
    if (v.description.trim().length < 10) out.push({ field: "exp-description", message: advance ? "Explain why you need the advance (at least 10 characters)" : "Say what was bought or paid, where and why (at least 10 characters)" });
    if (v.pay_by === "mobile_money" && !MOMO_RE.test(v.momoNumber.replace(/\s+/g, ""))) out.push({ field: "exp-momo", message: "Enter the MTN or Airtel number to pay, e.g. 0781234567" });
    if (!advance && !request && !files.length) out.push({ field: "exp-files", message: "Attach the receipt, a photo of it or the trip details" });
    setErrors(out);
    return !out.length;
  };

  const save = async () => {
    if (!check()) return;
    setBusy(true);
    try {
      const body = { category: v.category, amount: Number(v.amount), date: v.date, description: v.description.trim(), pay_by: v.pay_by, momoNumber: v.pay_by === "mobile_money" ? v.momoNumber.replace(/\s+/g, "") : "", momoName: v.momoName.trim() };
      const r = request ? await expensesApi.update(request.id, body) : await expensesApi.create(body);
      if (files.length) {
        try {
          await expensesApi.attach(r.id, files);
        } catch (e) {
          notify.error(`${r.number} was sent, but the files could not be attached: ${errorMessage(e)} Add them from the request.`);
        }
      }
      notify.success(`${r.number} sent to your head of department.`);
      onSaved?.(r);
      onClose();
    } catch (e) {
      setErrors([{ message: errorMessage(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const claims = list.filter((c) => c.kind !== "advance");
  const advances = list.filter((c) => c.kind === "advance");
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={request ? `Correct ${request.number}` : "Ask for money"}
      description={request ? "Make the changes asked for, then send it again." : "Get back what you paid for RALGA's work, or ask for a salary advance. Your head of department, then the Director of Finance approve it; the Cashier pays you."}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{request ? "Send again" : "Send for approval"}</Button></>}
    >
      <ErrorSummary errors={errors} title="Check these before sending" />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field label="What is it for?" required htmlFor="exp-category" hint={cat?.description || (cats.isLoading ? "Loading the categories…" : undefined)}>
          <Select id="exp-category" value={v.category} onChange={(e) => set({ category: e.target.value })} invalid={errors.some((x) => x.field === "exp-category")}>
            <option value="">{cats.isLoading ? "Loading…" : "Choose…"}</option>
            {claims.length > 0 && <optgroup label="Reimburse an expense">{claims.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
            {advances.length > 0 && <optgroup label="Advance">{advances.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
          </Select>
        </Field>
        <Field label="Amount" required htmlFor="exp-amount" hint={cat?.max_amount ? `At most ${fmtMoney(cat.max_amount)}` : advance ? "At most half of your last net pay" : undefined}>
          <MoneyInput id="exp-amount" value={v.amount} onChange={(n) => set({ amount: n })} invalid={errors.some((x) => x.field === "exp-amount")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
        <Field label={advance ? "Date of the request" : "Date of the expense"} required htmlFor="exp-date">
          <DatePicker id="exp-date" value={v.date} max={today()} onChange={(d) => set({ date: d })} />
        </Field>
        <Field label={advance ? "Why do you need it?" : "What was it for?"} required htmlFor="exp-description" hint={advance ? "It is deducted in full from your next payslip." : "Where, when and for which activity, e.g. “Taxi to the City of Kigali for the district meeting”."}>
          <Textarea id="exp-description" className="min-h-[76px]" value={v.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} invalid={errors.some((x) => x.field === "exp-description")} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-t-label font-semibold text-ims-text">How should you be paid?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {Object.entries(PAY_BY).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={v.pay_by === k}
              onClick={() => set({ pay_by: k })}
              className={cn("h-button rounded-control border px-3.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus", v.pay_by === k ? "border-ims-primary bg-ims-primary text-white" : "border-ims-field bg-ims-card text-ims-text hover:bg-ims-hover")}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {v.pay_by === "mobile_money" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile money number" required htmlFor="exp-momo">
            <Input id="exp-momo" inputMode="tel" value={v.momoNumber} placeholder="0781234567" onChange={(e) => set({ momoNumber: e.target.value })} invalid={errors.some((x) => x.field === "exp-momo")} />
          </Field>
          <Field label="Name on the account" htmlFor="exp-momo-name">
            <Input id="exp-momo-name" value={v.momoName} onChange={(e) => set({ momoName: e.target.value })} />
          </Field>
        </div>
      )}
      {v.pay_by === "bank_transfer" && <p className="text-t-small text-ims-muted">Paid to the bank account HR has on your file.</p>}
      {!advance && (
        <Field label={request ? "Add documents" : "Receipt or proof"} required={!request} htmlFor="exp-files" hint="PDF or photos, 20 MB each. Several files are fine.">
          <label htmlFor="exp-files" className={cn("flex min-h-[44px] cursor-pointer items-center gap-2 rounded-control border border-dashed px-3 text-t-body text-ims-muted hover:bg-ims-hover", errors.some((x) => x.field === "exp-files") ? "border-ims-danger" : "border-ims-field")}>
            <Paperclip size={16} aria-hidden /> Choose files
            <input id="exp-files" type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-control bg-ims-subtle px-3 py-1.5 text-t-small text-ims-body">
                  <span className="truncate">{f.name}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-ims-muted hover:text-ims-danger"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Field>
      )}
      {cat && <p className="text-t-small text-ims-muted">{EXPENSE_KIND[cat.kind]} · {advance ? "not an expense: it is deducted in full from your next payslip." : "charged to your department's budget."}</p>}
    </Modal>
  );
}
