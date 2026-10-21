/**
 * Prepare (or correct) a transfer between two RALGA accounts: bank to bank, a cash withdrawal for the petty
 * cash, or a cash deposit. The DAF (and the SG above the DAF limit) approves; it is then posted to both.
 */
import * as React from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Info } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { METHOD_LABELS, TRANSFER_METHODS, treasuryApi } from "@/lib/treasury";
import { errorMessage } from "@/lib/procurement";
import { rwf, showDay } from "@/lib/ims";
import { Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { AccountSelect, MoneyInput } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);

export default function TransferDialog({ open, onClose, onSaved, transfer }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; transfer?: any }) {
  const [f, setF] = React.useState({ from_account: "", to_account: "", amount: "" as number | "", transfer_date: today(), method: "", reference: "", description: "" });
  const [from, setFrom] = React.useState<any>(null);
  const [to, setTo] = React.useState<any>(null);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState<"" | "draft" | "submit">("");
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    const t = transfer || {};
    setF({ from_account: t.from_account || "", to_account: t.to_account || "", amount: t.amount ?? "", transfer_date: (t.transfer_date || today()).slice(0, 10), method: t.method || "", reference: t.reference || "", description: t.description || "" });
    setTried(false);
    setBusy("");
  }, [open, transfer]);

  React.useEffect(() => {
    if (!open) return;
    const get = (id: string, setter: (a: any) => void) => (id ? pocketbase.collection("bank_accounts").getOne(id, { expand: "funding_source" }).then(setter).catch(() => setter(null)) : setter(null));
    get(f.from_account, setFrom);
    get(f.to_account, setTo);
  }, [open, f.from_account, f.to_account]);

  const methods = from && to ? TRANSFER_METHODS[`${from.kind}>${to.kind}`] || [] : [];
  React.useEffect(() => {
    if (methods.length && !methods.includes(f.method)) set("method", methods[0]);
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const restricted = Boolean(from?.funding_source && from.funding_source !== to?.funding_source);
  const errors = {
    from_account: !f.from_account && "Choose the account the money leaves.",
    to_account: !f.to_account ? "Choose the account the money goes to." : f.to_account === f.from_account ? "Choose two different accounts." : from && to && !methods.length ? "Cash moves between cash books through a bank account." : "",
    amount: (!f.amount || Number(f.amount) <= 0) ? "Enter the amount." : from && Number(f.amount) > from.book_balance ? `Only ${rwf(from.book_balance)} in ${from.code}.` : "",
    transfer_date: !f.transfer_date ? "Enter the date." : f.transfer_date > today() ? "The date cannot be in the future." : "",
    reference: f.method === "cheque" && f.reference.trim().length < 3 && "Enter the cheque number.",
    description: restricted && f.description.trim().length < 15 && "Money leaves a restricted donor account: explain why (at least 15 characters).",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function save(submit: boolean) {
    setTried(true);
    if (invalid) return;
    setBusy(submit ? "submit" : "draft");
    const body = { ...f, amount: Number(f.amount), transfer_date: `${f.transfer_date} 12:00:00.000Z`, reference: f.reference.trim(), description: f.description.trim() };
    try {
      const t = transfer ? await pocketbase.collection("bank_transfers").update(transfer.id, body) : await pocketbase.collection("bank_transfers").create(body);
      if (submit) {
        await treasuryApi.doc("transfers", t.id, "submit");
        toast.success(`${t.number} sent for approval`);
      } else toast.success(`${t.number} saved as a draft`);
      onSaved(t.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      icon={ArrowRightLeft}
      title={transfer ? `Correct ${transfer.number}` : "Transfer between accounts"}
      description="Moves money between RALGA's own accounts. The DAF approves (the Secretary General too above the DAF limit); it is then posted out of one account and into the other."
      submitLabel={busy === "submit" ? "Sending…" : "Save and send for approval"}
      busy={Boolean(busy)}
      onSubmit={() => save(true)}
      footerExtra={<button type="button" disabled={Boolean(busy)} onClick={() => save(false)} className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:mr-auto sm:flex-none sm:px-4">{busy === "draft" ? "Saving…" : "Save draft"}</button>}
    >
      <FormBlock icon={ArrowRightLeft} title="From and to">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required error={tried && errors.from_account} htmlFor="tr-from" hint={from ? `Cash book balance ${rwf(from.book_balance)}` : undefined}>
            <AccountSelect id="tr-from" value={f.from_account} onChange={(v) => set("from_account", v)} invalid={Boolean(tried && errors.from_account)} />
          </Field>
          <Field label="To" required error={tried && errors.to_account} htmlFor="tr-to">
            <AccountSelect id="tr-to" value={f.to_account} exclude={f.from_account} onChange={(v) => set("to_account", v)} invalid={Boolean(tried && errors.to_account)} />
          </Field>
          <Field label="Amount" required error={tried && errors.amount} htmlFor="tr-amount">
            <MoneyInput id="tr-amount" value={f.amount} onChange={(v) => set("amount", v)} invalid={Boolean(tried && errors.amount)} />
          </Field>
          <Field label="Date" required error={tried && errors.transfer_date} htmlFor="tr-date" hint={from ? `${from.code} starts on ${showDay(from.opening_date)}` : undefined}>
            <input id="tr-date" type="date" className={inputCls} max={today()} value={f.transfer_date} onChange={(e) => set("transfer_date", e.target.value)} />
          </Field>
          <Field label="Method" htmlFor="tr-method">
            <select id="tr-method" className={inputCls} value={f.method} disabled={!methods.length} onChange={(e) => set("method", e.target.value)}>
              {!methods.length && <option value="">Choose the accounts first</option>}
              {methods.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field label={f.method === "cheque" ? "Cheque number" : "Bank reference"} required={f.method === "cheque"} error={tried && errors.reference} htmlFor="tr-ref">
            <input id="tr-ref" className={cn(inputCls, "font-mono")} value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder={f.method === "cheque" ? "e.g. 100259" : "e.g. BPR-TRF-0912"} />
          </Field>
          <Field label="Why" required={restricted} error={tried && errors.description} className="sm:col-span-2" htmlFor="tr-desc">
            <textarea id="tr-desc" className={cn(textareaCls, "min-h-[64px]")} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Petty cash replenishment" />
          </Field>
        </div>
        {restricted && (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <Info size={15} className="mt-0.5 shrink-0" /> {from.code} holds restricted money of {from.expand?.funding_source?.name || "a donor"}. Moving it out must be justified (for example a reimbursement of project costs paid from the operating account) and is visible to the auditors.
          </p>
        )}
      </FormBlock>
    </FormDialog>
  );
}
