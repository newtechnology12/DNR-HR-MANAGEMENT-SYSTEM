/**
 * Record (or correct) a receipt: which account the money came into, when, from whom, how much, how and
 * what it is for. Saved as a draft or sent straight to the DAF; the server re-checks every rule.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { PiggyBank, Info, Landmark, Receipt } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { PAYER_TYPES, METHOD_LABELS, RECEIPT_METHODS, treasuryApi } from "@/lib/treasury";
import { errorMessage } from "@/lib/procurement";
import { rwf, showDay } from "@/lib/ims";
import { Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { AccountSelect, MoneyInput } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);

export interface ReceiptPrefill {
  account?: string;
  receipt_date?: string;
  amount?: number;
  reference?: string;
  description?: string;
  statement_line?: string;
}

export default function ReceiptDialog({ open, onClose, onSaved, receipt, prefill }: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  receipt?: any;
  prefill?: ReceiptPrefill;
}) {
  const [account, setAccount] = React.useState<any>(null);
  const [f, setF] = React.useState({ account: "", receipt_date: today(), payer_type: "member", payer_name: "", amount: "" as number | "", method: "bank_transfer", reference: "", income_account: "", funding_source: "", project: "", description: "", statement_line: "" });
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState<"" | "draft" | "submit">("");
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    const src = receipt || {};
    setF({
      account: src.account || prefill?.account || "",
      receipt_date: (src.receipt_date || prefill?.receipt_date || today()).slice(0, 10),
      payer_type: src.payer_type || "member",
      payer_name: src.payer_name || "",
      amount: src.amount ?? prefill?.amount ?? "",
      method: src.method || "bank_transfer",
      reference: src.reference ?? prefill?.reference ?? "",
      income_account: src.income_account || "",
      funding_source: src.funding_source || "",
      project: src.project || "",
      description: src.description ?? prefill?.description ?? "",
      statement_line: src.statement_line || prefill?.statement_line || "",
    });
    setTried(false);
    setBusy("");
  }, [open, receipt, prefill]);

  const ref = useQuery(["receipt-ref"], async () => ({
    gl: await pocketbase.collection("gl_accounts").getFullList({ filter: 'is_posting = true && active = true && cash_flow_class != "cash" && (type = "revenue" || type = "liability" || type = "asset")', sort: "code", fields: "id,code,name,type" }),
    funds: await pocketbase.collection("funding_sources").getFullList({ filter: "active = true", sort: "code", fields: "id,code,name" }),
    projects: await pocketbase.collection("projects").getFullList({ filter: 'status = "active"', sort: "code", fields: "id,code,name,funding_source" }),
  }), { enabled: open, staleTime: 60000 });

  // Load the chosen account (also when editing) to know its kind and any funding restriction.
  React.useEffect(() => {
    if (!open || !f.account) return setAccount(null);
    let live = true;
    pocketbase.collection("bank_accounts").getOne(f.account, { expand: "funding_source" }).then((a) => live && setAccount(a)).catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, [open, f.account]);

  const cash = account?.kind === "cash";
  const methods = cash ? ["cash"] : RECEIPT_METHODS.filter((m) => m !== "cash");
  React.useEffect(() => {
    if (account && !methods.includes(f.method)) set("method", methods[0]);
    if (account?.funding_source && f.funding_source !== account.funding_source) set("funding_source", account.funding_source);
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = {
    account: !f.account && "Choose the account the money came into.",
    receipt_date: !f.receipt_date ? "Enter the date the money was received." : f.receipt_date > today() ? "The date cannot be in the future." : account && f.receipt_date < String(account.opening_date).slice(0, 10) ? `The account starts on ${showDay(account.opening_date)}.` : "",
    payer_name: f.payer_name.trim().length < 2 && "Enter who paid.",
    amount: (!f.amount || Number(f.amount) <= 0) && "Enter the amount received.",
    reference: f.method === "cheque" && f.reference.trim().length < 3 && "Enter the cheque number.",
    income_account: !f.income_account && "Choose what the money is for.",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function save(submit: boolean) {
    setTried(true);
    if (invalid) return;
    setBusy(submit ? "submit" : "draft");
    const body = {
      account: f.account, receipt_date: `${f.receipt_date} 12:00:00.000Z`, payer_type: f.payer_type, payer_name: f.payer_name.trim(), amount: Number(f.amount),
      method: f.method, reference: f.reference.trim(), income_account: f.income_account, funding_source: f.funding_source, project: f.project, description: f.description.trim(),
      statement_line: f.statement_line,
    };
    try {
      const r = receipt ? await pocketbase.collection("cash_receipts").update(receipt.id, body) : await pocketbase.collection("cash_receipts").create(body);
      if (submit) {
        await treasuryApi.doc("receipts", r.id, "submit");
        toast.success(`${r.number} sent to the DAF for verification`);
      } else toast.success(`${r.number} saved as a draft`);
      onSaved(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  const groups: [string, string][] = [["revenue", "Income"], ["liability", "Received on behalf of / deferred"], ["asset", "Repayment of a receivable or advance"]];
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      icon={PiggyBank}
      title={receipt ? `Correct ${receipt.number}` : "Record a receipt"}
      description="Money received in a RALGA bank account or the petty cash. The DAF verifies it before it is posted to the cash book."
      submitLabel={busy === "submit" ? "Sending…" : "Save and send to the DAF"}
      busy={Boolean(busy)}
      onSubmit={() => save(true)}
      footerExtra={<button type="button" disabled={Boolean(busy)} onClick={() => save(false)} className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:mr-auto sm:flex-none sm:px-4">{busy === "draft" ? "Saving…" : "Save draft"}</button>}
    >
      {f.statement_line && (
        <p className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900">
          <Info size={15} className="mt-0.5 shrink-0" /> From the bank statement: once the DAF approves, the receipt is matched to that statement line automatically.
        </p>
      )}
      <FormBlock icon={Landmark} title="Money received">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Into account" required error={tried && errors.account} className="sm:col-span-2" htmlFor="rc-account">
            <AccountSelect id="rc-account" value={f.account} onChange={(v) => set("account", v)} invalid={Boolean(tried && errors.account)} />
          </Field>
          <Field label="Date received" required error={tried && errors.receipt_date} htmlFor="rc-date">
            <input id="rc-date" type="date" className={inputCls} max={today()} value={f.receipt_date} onChange={(e) => set("receipt_date", e.target.value)} aria-invalid={Boolean(tried && errors.receipt_date) || undefined} />
          </Field>
          <Field label="Amount" required error={tried && errors.amount} htmlFor="rc-amount" hint={f.amount ? rwf(Number(f.amount)) : undefined}>
            <MoneyInput id="rc-amount" value={f.amount} onChange={(v) => set("amount", v)} invalid={Boolean(tried && errors.amount)} />
          </Field>
          <Field label="How" required htmlFor="rc-method">
            <select id="rc-method" className={inputCls} value={f.method} onChange={(e) => set("method", e.target.value)}>
              {methods.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field label={f.method === "cheque" ? "Cheque number" : "Bank reference"} required={f.method === "cheque"} error={tried && errors.reference} htmlFor="rc-ref" hint={f.method === "cheque" ? undefined : "Helps the automatic matching with the bank statement"}>
            <input id="rc-ref" className={cn(inputCls, "font-mono")} value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder={f.method === "cheque" ? "e.g. 004417" : "e.g. GSB-CONTR-2627"} />
          </Field>
        </div>
      </FormBlock>
      <FormBlock icon={Receipt} title="From whom and what for">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind of payer" htmlFor="rc-ptype">
            <select id="rc-ptype" className={inputCls} value={f.payer_type} onChange={(e) => set("payer_type", e.target.value)}>
              {Object.entries(PAYER_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Received from" required error={tried && errors.payer_name} htmlFor="rc-payer">
            <input id="rc-payer" className={inputCls} value={f.payer_name} onChange={(e) => set("payer_name", e.target.value)} placeholder="e.g. Gasabo District" aria-invalid={Boolean(tried && errors.payer_name) || undefined} />
          </Field>
          <Field label="What it is for (account)" required error={tried && errors.income_account} className="sm:col-span-2" htmlFor="rc-income" hint="Member contributions 4101, Government transfers 4102, donor grants 4104, fees 4201–4202…">
            <select id="rc-income" className={inputCls} value={f.income_account} onChange={(e) => set("income_account", e.target.value)} aria-invalid={Boolean(tried && errors.income_account) || undefined}>
              <option value="">Choose…</option>
              {groups.map(([t, label]) => (
                <optgroup key={t} label={label}>
                  {(ref.data?.gl || []).filter((g: any) => g.type === t).map((g: any) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Funding source" htmlFor="rc-fund" hint={account?.funding_source ? "This account holds restricted money of this funding source only." : undefined}>
            <select id="rc-fund" className={inputCls} value={f.funding_source} disabled={Boolean(account?.funding_source)} onChange={(e) => set("funding_source", e.target.value)}>
              <option value="">Not specified</option>
              {(ref.data?.funds || []).map((x: any) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </select>
          </Field>
          <Field label="Project" htmlFor="rc-project">
            <select id="rc-project" className={inputCls} value={f.project} onChange={(e) => set("project", e.target.value)}>
              <option value="">None</option>
              {(ref.data?.projects || []).filter((p: any) => !f.funding_source || p.funding_source === f.funding_source).map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2" htmlFor="rc-desc">
            <textarea id="rc-desc" className={cn(textareaCls, "min-h-[64px]")} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Annual member contribution 2026/27" />
          </Field>
        </div>
      </FormBlock>
    </FormDialog>
  );
}
