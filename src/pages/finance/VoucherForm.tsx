/**
 * New / edit payment voucher. Supplier invoices: pick the supplier, tick the approved invoices and the
 * amount to pay on each. Direct expense: payee, budget line, amount, description. Withholding tax comes
 * from the dated tax table and is computed on the amount before VAT; the server recomputes everything.
 */
import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, FileCheck2, Landmark, Paperclip, Receipt, Save, Send, ShieldCheck, Trash2, Upload, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { BANK_LABELS, VOUCHER_TYPES, payablesApi, withholdingRates } from "@/lib/payables";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/enterprise/ui";
import { Field, FormBlock, inputCls, Segmented, textareaCls } from "@/components/portal/kit";
import { BudgetLinePicker } from "@/components/budget/BudgetKit";
import { cn } from "@/utils";

type Pick = { invoice: string; amount: string; checked: boolean };
const MAX_FILE = 20 * 1024 * 1024;

export default function VoucherForm() {
  const { voucherId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const editing = Boolean(voucherId);

  const existing = useQuery(["voucher", voucherId], () => pocketbase.collection("payment_vouchers").getOne(voucherId!), { enabled: editing });
  const [type, setType] = React.useState<"invoice" | "direct">((params.get("type") as any) || "invoice");
  const [supplier, setSupplier] = React.useState(params.get("supplier") || "");
  const [picks, setPicks] = React.useState<Record<string, Pick>>({});
  const [payeeName, setPayeeName] = React.useState("");
  const [payeeBank, setPayeeBank] = React.useState<Record<string, string>>({});
  const [budgetLine, setBudgetLine] = React.useState("");
  const [gross, setGross] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [wht, setWht] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const v: any = existing.data;
    if (!v) return;
    setType(v.voucher_type);
    setSupplier(v.supplier || "");
    setPicks(Object.fromEntries((v.lines || []).map((l: any) => [l.invoice, { invoice: l.invoice, amount: String(l.amount), checked: true }])));
    setPayeeName(v.payee_name || "");
    setPayeeBank(v.payee_bank || {});
    setBudgetLine(v.budget_line || "");
    setGross(v.voucher_type === "direct" ? String(v.gross_amount || "") : "");
    setDescription(v.description || "");
    setWht(v.wht_code || "");
    setDueDate(v.due_date ? String(v.due_date).slice(0, 10) : "");
    setNotes(v.notes || "");
  }, [existing.data]);

  const suppliers = useQuery(["active-suppliers"], () => pocketbase.collection("suppliers").getFullList({ filter: 'status = "active"', sort: "name" }));
  const rates = useQuery(["wht-rates"], withholdingRates, { staleTime: 5 * 60_000 });
  const payable = useQuery(["payable-invoices", supplier, voucherId], () => payablesApi.payable(supplier, voucherId), { enabled: type === "invoice" && Boolean(supplier) });
  const sup: any = (suppliers.data || []).find((s: any) => s.id === supplier);

  // Opening from an invoice (?invoice=…) ticks it.
  React.useEffect(() => {
    const inv = params.get("invoice");
    if (!inv || !payable.data || picks[inv]) return;
    const row = payable.data.items.find((x) => x.id === inv);
    if (row) setPicks((p) => ({ ...p, [inv]: { invoice: inv, amount: String(row.open), checked: true } }));
  }, [payable.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = Number((rates.data || []).find((r: any) => r.code === wht)?.rate || 0);
  const rateRec: any = (rates.data || []).find((r: any) => r.code === wht);
  const chosen = (payable.data?.items || []).filter((x) => picks[x.id]?.checked);
  const lineErrors: Record<string, string> = {};
  for (const x of chosen) {
    const a = Math.round(Number(picks[x.id].amount) || 0);
    if (a <= 0) lineErrors[x.id] = "Enter the amount";
    else if (a > x.open) lineErrors[x.id] = `At most ${rwf(x.open)}`;
  }
  const totals = type === "invoice"
    ? chosen.reduce((t, x) => {
        const a = Math.round(Number(picks[x.id].amount) || 0);
        const base = x.total > 0 ? Math.round((a * x.subtotal) / x.total) : a;
        return { gross: t.gross + a, base: t.base + base };
      }, { gross: 0, base: 0 })
    : { gross: Math.round(Number(gross) || 0), base: Math.round(Number(gross) || 0) };
  const whtAmount = Math.round((totals.base * rate) / 100);

  const errors = {
    supplier: type === "invoice" && !supplier && "Choose the supplier.",
    invoices: type === "invoice" && !chosen.length && "Tick at least one invoice to pay.",
    lines: type === "invoice" && Object.keys(lineErrors).length > 0 && "Check the amounts.",
    payee: type === "direct" && !supplier && !payeeName.trim() && "Enter the payee or choose a registered supplier.",
    budgetLine: type === "direct" && !budgetLine && "Choose the budget line.",
    gross: type === "direct" && !(Number(gross) > 0) && "Enter the amount.",
    description: type === "direct" && description.trim().length < 5 && "Describe what is being paid.",
  };
  const invalid = Object.values(errors).some(Boolean);

  function addFiles(list: FileList | null) {
    const ok: File[] = [];
    for (const f of Array.from(list || [])) {
      if (f.size > MAX_FILE) toast.error(`${f.name} is larger than 20 MB.`);
      else ok.push(f);
    }
    setFiles((x) => [...x, ...ok].slice(0, 10));
  }

  async function save(submit: boolean) {
    setTried(true);
    setError("");
    if (invalid) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("voucher_type", type);
      body.append("supplier", supplier);
      body.append("wht_code", wht);
      body.append("due_date", dueDate ? `${dueDate} 00:00:00.000Z` : "");
      body.append("notes", notes);
      body.append("description", description);
      if (type === "invoice") {
        body.append("lines", JSON.stringify(chosen.map((x) => ({ invoice: x.id, amount: Math.round(Number(picks[x.id].amount)) }))));
      } else {
        body.append("lines", "[]");
        body.append("budget_line", budgetLine);
        body.append("gross_amount", String(Math.round(Number(gross))));
        body.append("payee_name", supplier ? "" : payeeName.trim());
        body.append("payee_bank", JSON.stringify(supplier ? {} : payeeBank));
      }
      files.forEach((f) => body.append("attachments", f));
      removed.forEach((f) => body.append("attachments-", f));
      const v: any = editing ? await pocketbase.collection("payment_vouchers").update(voucherId!, body) : await pocketbase.collection("payment_vouchers").create(body);
      if (submit) {
        try {
          await payablesApi.action(v.id, "submit");
          toast.success(`${v.number} sent for approval`);
        } catch (e) {
          toast.error(`${v.number} saved as draft, but not submitted: ${errorMessage(e)}`);
          navigate(`/dashboard/finance/vouchers/${v.id}`);
          return;
        }
      } else toast.success(`${v.number} saved as draft`);
      navigate(`/dashboard/finance/vouchers/${v.id}`);
    } catch (e) {
      setError(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  if (!can("manage_payment_vouchers")) return <div className="p-6"><EmptyState icon={FileCheck2} title="Not available" text="Only the Accountant prepares payment vouchers." /></div>;
  if (editing && existing.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  const ev: any = existing.data;
  if (ev && !["draft", "returned"].includes(ev.status)) {
    return <div className="p-6"><EmptyState icon={FileCheck2} title={`${ev.number} can no longer be edited`} text="Only drafts and returned vouchers can be changed." action={<Button size="sm" onClick={() => navigate(`/dashboard/finance/vouchers/${ev.id}`)}>Open it</Button>} /></div>;
  }

  return (
    <div className="space-y-4 px-3 pb-24 sm:px-4">
      <PageHeader
        title={editing ? `Edit ${ev?.number || "voucher"}` : "New payment voucher"}
        description={ev?.status === "returned" ? "Sent back for correction — update it and submit again; approval restarts from the first step." : "The server recomputes every amount, the tax withheld and the bank details from the verified records."}
        breadcrumbs={[{ title: "Payables", link: "/dashboard/finance/invoices" }, { title: "Payment vouchers", link: "/dashboard/finance/vouchers" }, { title: editing ? "Edit" : "New", link: "#" }]}
      />
      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-card sm:p-5">
            <FormBlock icon={FileCheck2} title="What is paid">
              <Segmented value={type} onChange={(t) => { setType(t as any); setTried(false); }} options={Object.entries(VOUCHER_TYPES).map(([value, t]) => ({ value: value as any, label: t.label, hint: t.hint }))} ariaLabel="Voucher type" />
              <p className="text-[12.5px] text-slate-500">{VOUCHER_TYPES[type].hint}.</p>
            </FormBlock>

            <FormBlock icon={Landmark} title="Payee">
              <Field label={type === "invoice" ? "Supplier" : "Registered supplier (optional)"} required={type === "invoice"} error={tried && errors.supplier}>
                <select className={inputCls} value={supplier} onChange={(e) => { setSupplier(e.target.value); setPicks({}); }}>
                  <option value="">{type === "invoice" ? "Choose the supplier…" : "— Not a registered supplier —"}</option>
                  {(suppliers.data || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.tin ? ` · TIN ${s.tin}` : ""}</option>)}
                </select>
              </Field>
              {sup && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px]">
                  <p className="mb-1 flex items-center gap-1.5 font-medium text-slate-700"><ShieldCheck size={14} className="text-emerald-600" /> Verified bank details (paid to this account)</p>
                  <p className="text-slate-600">{sup.bank_name || "—"}{sup.bank_branch ? `, ${sup.bank_branch}` : ""} · <span className="font-mono">{sup.bank_account_number || "no account on file"}</span> · {sup.bank_account_name}</p>
                  {sup.bank_change_pending && <p className="mt-1 flex items-center gap-1 text-amber-800"><AlertTriangle size={13} /> A bank details change is waiting for Finance; this voucher uses the verified account above.</p>}
                </div>
              )}
              {type === "direct" && !supplier && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Payee name" required error={tried && errors.payee} className="sm:col-span-2"><input className={inputCls} value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="e.g. Rwanda Energy Group (REG)" /></Field>
                  {BANK_LABELS.map(([k, label]) => (
                    <Field key={k} label={label}><input className={cn(inputCls, k === "bank_account_number" && "font-mono")} value={payeeBank[k] || ""} onChange={(e) => setPayeeBank((b) => ({ ...b, [k]: e.target.value }))} /></Field>
                  ))}
                </div>
              )}
            </FormBlock>
          </section>

          {type === "invoice" ? (
            <section className="rounded-lg border border-slate-200 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><Receipt size={15} className="text-slate-400" /> Approved invoices to pay</h3>
                {tried && (errors.invoices || errors.lines) && <span className="text-[12px] font-medium text-red-600">{errors.invoices || errors.lines}</span>}
              </div>
              {!supplier ? <p className="px-4 py-8 text-center text-[13px] text-slate-500">Choose the supplier to see its approved, unpaid invoices.</p> : payable.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : !payable.data?.items.length ? (
                <p className="px-4 py-8 text-center text-[13px] text-slate-500">No approved invoice of this supplier is waiting for payment.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[760px]">
                    <thead><tr><th className="w-8" /><th>Invoice</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Unpaid</th><th className="text-right">On other vouchers</th><th className="w-44 text-right">Pay now</th></tr></thead>
                    <tbody>
                      {payable.data.items.map((x) => {
                        const p = picks[x.id];
                        const late = x.due_date && x.due_date < new Date().toISOString().slice(0, 10);
                        return (
                          <tr key={x.id} className={cn(p?.checked && "bg-primary/[0.03]")}>
                            <td><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary" checked={Boolean(p?.checked)} disabled={!x.open && !p?.checked} onChange={(e) => setPicks((all) => ({ ...all, [x.id]: { invoice: x.id, amount: all[x.id]?.amount || String(x.open), checked: e.target.checked } }))} aria-label={`Pay ${x.number}`} /></td>
                            <td><span className="block font-mono text-[12.5px] font-semibold">{x.number}</span><span className="block text-[12px] text-slate-500">Supplier ref. {x.supplier_invoice_number} · {showDay(x.invoice_date)}</span></td>
                            <td className={cn("whitespace-nowrap text-[12.5px]", late ? "font-medium text-red-700" : "text-slate-600")}>{x.due_date ? showDay(x.due_date) : "—"}{late ? " · overdue" : ""}</td>
                            <td className="text-right tabular-nums text-slate-600">{rwf(x.total)}</td>
                            <td className="text-right font-medium tabular-nums">{rwf(x.balance)}</td>
                            <td className="text-right tabular-nums text-slate-500">{x.held ? rwf(x.held) : "—"}</td>
                            <td className="text-right">
                              <input type="number" min={0} max={x.open} disabled={!p?.checked} value={p?.amount ?? ""} onChange={(e) => setPicks((all) => ({ ...all, [x.id]: { ...all[x.id], amount: e.target.value } }))} className={cn(inputCls, "h-9 w-40 text-right tabular-nums", lineErrors[x.id] && tried && "border-red-400")} aria-label={`Amount for ${x.number}`} />
                              {tried && lineErrors[x.id] && <span className="mt-0.5 block text-[11.5px] text-red-600">{lineErrors[x.id]}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-card sm:p-5">
              <FormBlock icon={Wallet} title="Budget and amount">
                <Field label="Budget line" required error={tried && errors.budgetLine}>
                  <BudgetLinePicker value={budgetLine} onChange={setBudgetLine} amount={Number(gross) || undefined} anyDepartment />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Amount (RWF, VAT included if any)" required error={tried && errors.gross}><input type="number" min={0} className={cn(inputCls, "text-right tabular-nums")} value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
                </div>
                <Field label="What is paid" required error={tried && errors.description}><textarea className={cn(textareaCls, "min-h-[70px]")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Electricity — Head Office, October 2026 (meter 0412337)" /></Field>
              </FormBlock>
            </section>
          )}

          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-card sm:p-5">
            <FormBlock icon={Receipt} title="Tax and terms">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Withholding tax" hint={rateRec && !rateRec.confirmed_by_finance ? "This rate is not yet confirmed by Finance (Setup → Tax & statutory rates)." : "From the dated tax table; computed on the amount before VAT."}>
                  <select className={inputCls} value={wht} onChange={(e) => setWht(e.target.value)}>
                    <option value="">No withholding</option>
                    {(rates.data || []).map((r: any) => <option key={r.id} value={r.code}>{r.name} — {r.rate}%</option>)}
                  </select>
                </Field>
                <Field label="Pay by"><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>
              {type === "invoice" && <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Filled in from the invoices when left empty" /></Field>}
              <Field label="Notes for the approvers"><textarea className={cn(textareaCls, "min-h-[60px]")} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </FormBlock>
            <FormBlock icon={Paperclip} title="Supporting documents">
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-[13px] text-slate-600 hover:border-primary/40 hover:bg-primary/[0.03]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              >
                <Upload size={18} className="text-slate-400" />
                <span><span className="font-medium text-primaryDark">Choose files</span> or drop them here</span>
                <span className="text-[11.5px] text-slate-500">Invoice, delivery note, contract… PDF or images, up to 20 MB each, 10 files</span>
                <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
              {(files.length > 0 || (ev?.attachments || []).length > 0) && (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-[12.5px]">
                  {(ev?.attachments || []).filter((f: string) => !removed.includes(f)).map((f: string) => (
                    <li key={f} className="flex items-center justify-between gap-2 px-3 py-2">
                      <a href={pocketbase.files.getUrl(ev, f)} target="_blank" rel="noreferrer" className="truncate text-primaryDark hover:underline">{f}</a>
                      <button type="button" onClick={() => setRemoved((r) => [...r, f])} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${f}`}><Trash2 size={13} /></button>
                    </li>
                  ))}
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate">{f.name} <span className="text-slate-400">· {(f.size / 1024 / 1024).toFixed(1)} MB · new</span></span>
                      <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${f.name}`}><Trash2 size={13} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </FormBlock>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
            <h3 className="mb-3 text-[13.5px] font-semibold text-slate-900">Summary</h3>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-slate-600">Gross amount</dt><dd className="font-medium tabular-nums">{rwf(totals.gross)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Taxable amount (before VAT)</dt><dd className="tabular-nums text-slate-600">{rwf(totals.base)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Withholding tax {rate ? `(${rate}%)` : ""}</dt><dd className="tabular-nums text-slate-600">{whtAmount ? `− ${rwf(whtAmount)}` : "—"}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-[15px] font-semibold"><dt>Net to the payee</dt><dd className="tabular-nums">{rwf(totals.gross - whtAmount)}</dd></div>
            </dl>
            <p className="mt-3 text-[11.5px] text-slate-500">Approval: Director of Finance, and the Secretary General above the DAF limit. The Cashier then executes; whoever prepared or approved it cannot.</p>
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-[280px]">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button variant="outline" disabled={busy} onClick={() => save(false)}><Save size={14} /> Save draft</Button>
          <Button disabled={busy} onClick={() => save(true)}><Send size={14} /> {busy ? "Saving…" : "Save and submit"}</Button>
        </div>
      </div>
    </div>
  );
}
