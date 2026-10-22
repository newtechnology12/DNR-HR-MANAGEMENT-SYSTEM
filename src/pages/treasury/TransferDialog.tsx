/**
 * Prepare (or correct) a transfer between two RALGA accounts: bank to bank, a cash withdrawal for the petty
 * cash, or a cash deposit. The DAF (and the SG above the DAF limit) approves; it is then posted to both.
 */
import * as React from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { METHOD_LABELS, TRANSFER_METHODS, treasuryApi } from "@/lib/treasury";
import { errorMessage } from "@/lib/procurement";
import { Button, DatePicker, Field, Input, Modal, ModalSection, Select, Textarea, fmtDate, fmtMoney } from "@/components/ims";
import { AccountSelect, MoneyInput } from "@/components/treasury/TreasuryKit";

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
    to_account: !f.to_account ? "Choose the account the money goes to." : f.to_account === f.from_account ? "Choose two different accounts." : from && to && !methods.length ? "Cash moves between cash books through a bank account: choose a bank account on one side." : "",
    amount: (!f.amount || Number(f.amount) <= 0) ? "Enter the amount, above 0." : from && Number(f.amount) > from.book_balance ? `Enter at most ${fmtMoney(from.book_balance)}, the balance of ${from.code}.` : "",
    transfer_date: !f.transfer_date ? "Enter the date." : f.transfer_date > today() ? "Choose today or a date in the past." : "",
    reference: f.method === "cheque" && f.reference.trim().length < 3 && "Enter the cheque number (at least 3 characters).",
    description: restricted && f.description.trim().length < 15 && "Money leaves a restricted donor account: explain why in at least 15 characters.",
  };
  const invalid = Object.values(errors).some(Boolean);
  const err = (k: keyof typeof errors) => (tried ? errors[k] || null : null);

  async function save(submit: boolean) {
    setTried(true);
    if (invalid) return;
    setBusy(submit ? "submit" : "draft");
    const body = { ...f, amount: Number(f.amount), transfer_date: `${f.transfer_date} 12:00:00.000Z`, reference: f.reference.trim(), description: f.description.trim() };
    try {
      const t = transfer?.id ? await pocketbase.collection("bank_transfers").update(transfer.id, body) : await pocketbase.collection("bank_transfers").create(body);
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
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={transfer?.number ? <>Correct <span className="whitespace-nowrap">{transfer.number}</span></> : "Transfer between accounts"}
      description="Moves money between RALGA's own accounts. The DAF approves (and the Secretary General above the DAF limit); it is then posted to both accounts."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={Boolean(busy)}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(false)} loading={busy === "draft"} disabled={Boolean(busy)}>Save draft</Button>
          <Button variant="primary" onClick={() => save(true)} loading={busy === "submit"} disabled={Boolean(busy)}>Submit for approval</Button>
        </>
      }
    >
      {tried && invalid && (
        <p role="alert" className="rounded-control border border-ims-danger/40 bg-ims-danger-bg px-3.5 py-2.5 text-t-small font-semibold text-ims-danger">
          Check the fields marked in red before you save.
        </p>
      )}
      <ModalSection title="From and to">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required error={err("from_account")} htmlFor="tr-from" hint={from ? `Cash book balance ${fmtMoney(from.book_balance)}` : undefined}>
            <AccountSelect id="tr-from" value={f.from_account} onChange={(v) => set("from_account", v)} invalid={Boolean(err("from_account"))} />
          </Field>
          <Field label="To" required error={err("to_account")} htmlFor="tr-to">
            <AccountSelect id="tr-to" value={f.to_account} exclude={f.from_account} onChange={(v) => set("to_account", v)} invalid={Boolean(err("to_account"))} />
          </Field>
        </div>
        {restricted && (
          <p className="flex items-start gap-2 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3.5 py-2.5 text-t-small text-ims-warning">
            <Info size={15} className="mt-px shrink-0" aria-hidden /> {from.code} holds restricted money of {from.expand?.funding_source?.name || "a donor"}. Moving it out must be justified (for example a reimbursement of project costs paid from the operating account) and is visible to the auditors.
          </p>
        )}
      </ModalSection>
      <ModalSection title="Amount and method">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required error={err("amount")} htmlFor="tr-amount">
            <MoneyInput id="tr-amount" value={f.amount} onChange={(v) => set("amount", v)} invalid={Boolean(err("amount"))} />
          </Field>
          <Field label="Date" required error={err("transfer_date")} htmlFor="tr-date" hint={from ? `${from.code} starts on ${fmtDate(from.opening_date)}` : undefined}>
            <DatePicker id="tr-date" max={today()} value={f.transfer_date} onChange={(v) => set("transfer_date", v)} invalid={Boolean(err("transfer_date"))} />
          </Field>
          <Field label="Method" htmlFor="tr-method">
            <Select id="tr-method" value={f.method} disabled={!methods.length} onChange={(e) => set("method", e.target.value)}>
              {!methods.length && <option value="">Choose the accounts first</option>}
              {methods.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </Select>
          </Field>
          <Field label={f.method === "cheque" ? "Cheque number" : "Bank reference"} required={f.method === "cheque"} error={err("reference")} htmlFor="tr-ref">
            <Input id="tr-ref" className="font-mono" value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder={f.method === "cheque" ? "e.g. 100259" : "e.g. BPR-TRF-0912"} invalid={Boolean(err("reference"))} />
          </Field>
          <Field label="Why" required={restricted} error={err("description")} className="sm:col-span-2" htmlFor="tr-desc">
            <Textarea id="tr-desc" className="min-h-[72px]" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Petty cash replenishment" invalid={Boolean(err("description"))} />
          </Field>
        </div>
      </ModalSection>
    </Modal>
  );
}
