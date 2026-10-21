/**
 * Set up or change a bank account or cash book (Director of Finance). Once an account has transactions its
 * type, GL account and opening balance are locked by the server.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { BookOpenCheck, Landmark, ShieldCheck, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { ChoiceCards, Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { MoneyInput } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const blank = { kind: "bank" as "bank" | "cash", code: "", name: "", bank_name: "", branch: "", account_number: "", account_name: "", swift_code: "", gl_account: "", funding_source: "", opening_balance: "" as number | "", opening_date: "", custodian: "", cash_limit: "" as number | "", signatories: "", is_default: false, status: "active", notes: "" };

export default function AccountDialog({ open, onClose, onSaved, account, locked }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; account?: any; locked?: boolean }) {
  const [f, setF] = React.useState(blank);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof blank, v: any) => setF((x) => ({ ...x, [k]: v }));
  React.useEffect(() => {
    if (!open) return;
    setF(account ? { ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, account[k] ?? (blank as any)[k]])), opening_date: String(account.opening_date || "").slice(0, 10) } : { ...blank, opening_date: new Date().toISOString().slice(0, 10) });
    setTried(false);
  }, [open, account]);

  const ref = useQuery(["account-ref"], async () => ({
    gl: await pocketbase.collection("gl_accounts").getFullList({ filter: 'is_posting = true && active = true && type = "asset" && cash_flow_class = "cash"', sort: "code", fields: "id,code,name" }),
    funds: await pocketbase.collection("funding_sources").getFullList({ filter: "active = true", sort: "code", fields: "id,code,name,restricted" }),
    users: await pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", fields: "id,name,email" }),
    used: await pocketbase.collection("bank_accounts").getFullList({ fields: "id,gl_account,code" }),
  }), { enabled: open, staleTime: 60000 });
  const bank = f.kind === "bank";
  const usedGl = (ref.data?.used || []).filter((a: any) => a.id !== account?.id);

  const errors = {
    code: !/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(f.code.trim()) && "2–20 letters, digits or dashes, e.g. BK-OPS.",
    name: f.name.trim().length < 3 && "Enter the account name.",
    bank_name: bank && !f.bank_name.trim() && "Enter the bank.",
    account_number: bank && !/^[0-9][0-9 -]{4,33}$/.test(f.account_number.trim()) && "Digits, spaces or dashes.",
    custodian: !bank && !f.custodian && "Choose who holds the cash.",
    gl_account: !f.gl_account ? "Choose the cash account in the chart of accounts." : usedGl.some((a: any) => a.gl_account === f.gl_account) ? `Already used by ${usedGl.find((a: any) => a.gl_account === f.gl_account).code}.` : "",
    opening_date: !f.opening_date ? "Enter the opening date." : f.opening_date > new Date().toISOString().slice(0, 10) ? "It cannot be in the future." : "",
    opening_balance: f.opening_balance === "" && "Enter the opening balance (0 for a new account).",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function save() {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    const body: Record<string, unknown> = { ...f, code: f.code.trim().toUpperCase(), opening_balance: Number(f.opening_balance) || 0, cash_limit: Number(f.cash_limit) || 0, opening_date: `${f.opening_date} 12:00:00.000Z`, currency: "RWF" };
    try {
      const r = account ? await pocketbase.collection("bank_accounts").update(account.id, body) : await pocketbase.collection("bank_accounts").create(body);
      toast.success(account ? `${r.code} updated` : `${r.code} set up`);
      onSaved(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog open={open} onClose={onClose} icon={Landmark} title={account ? `Change ${account.code}` : "New bank account or cash book"} description="Only the Director of Finance sets up accounts. Every change is in the audit log." submitLabel={account ? "Save changes" : "Set up account"} busy={busy} onSubmit={save} wide>
      {!account && (
        <ChoiceCards
          value={f.kind}
          onChange={(v) => set("kind", v)}
          options={[
            { value: "bank", label: "Bank account", description: "Reconciled with the bank statement every month", icon: Landmark },
            { value: "cash", label: "Cash book", description: "Petty cash in the office, checked by a cash count", icon: Wallet },
          ]}
        />
      )}
      <FormBlock icon={bank ? Landmark : Wallet} title={bank ? "Bank account" : "Cash book"}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" required error={tried && errors.code} htmlFor="ac-code" hint="Short name used everywhere"><input id="ac-code" className={cn(inputCls, "font-mono uppercase")} value={f.code} onChange={(e) => set("code", e.target.value)} placeholder={bank ? "BK-OPS" : "PC-HQ"} /></Field>
          <Field label="Name" required error={tried && errors.name} className="sm:col-span-2" htmlFor="ac-name"><input id="ac-name" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={bank ? "Operating account" : "Petty cash — Head Office"} /></Field>
          {bank ? (
            <>
              <Field label="Bank" required error={tried && errors.bank_name} htmlFor="ac-bank"><input id="ac-bank" className={inputCls} value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Bank of Kigali" /></Field>
              <Field label="Branch" htmlFor="ac-branch"><input id="ac-branch" className={inputCls} value={f.branch} onChange={(e) => set("branch", e.target.value)} /></Field>
              <Field label="SWIFT / BIC" htmlFor="ac-swift"><input id="ac-swift" className={cn(inputCls, "font-mono uppercase")} value={f.swift_code} onChange={(e) => set("swift_code", e.target.value)} /></Field>
              <Field label="Account number" required error={tried && errors.account_number} htmlFor="ac-number"><input id="ac-number" className={cn(inputCls, "font-mono")} value={f.account_number} onChange={(e) => set("account_number", e.target.value)} /></Field>
              <Field label="Account name at the bank" className="sm:col-span-2" htmlFor="ac-aname"><input id="ac-aname" className={inputCls} value={f.account_name} onChange={(e) => set("account_name", e.target.value)} /></Field>
              <Field label="Signatories" className="sm:col-span-3" htmlFor="ac-sign" hint="Who signs payments from this account"><input id="ac-sign" className={inputCls} value={f.signatories} onChange={(e) => set("signatories", e.target.value)} placeholder="Any two of: Secretary General, Director of Finance…" /></Field>
            </>
          ) : (
            <>
              <Field label="Custodian" required error={tried && errors.custodian} className="sm:col-span-2" htmlFor="ac-cust">
                <select id="ac-cust" className={inputCls} value={f.custodian} onChange={(e) => set("custodian", e.target.value)}>
                  <option value="">Who holds the cash…</option>
                  {(ref.data?.users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Cash limit" htmlFor="ac-limit" hint="The most cash kept; shown in red above it"><MoneyInput id="ac-limit" value={f.cash_limit} onChange={(v) => set("cash_limit", v)} /></Field>
            </>
          )}
        </div>
      </FormBlock>
      <FormBlock icon={BookOpenCheck} title="Accounting">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="GL cash account" required error={tried && errors.gl_account} htmlFor="ac-gl" hint={locked ? "Locked: the account has transactions" : "Asset account with cash flow class “cash”"}>
            <select id="ac-gl" className={inputCls} value={f.gl_account} disabled={locked} onChange={(e) => set("gl_account", e.target.value)}>
              <option value="">Choose…</option>
              {(ref.data?.gl || []).map((g: any) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
            </select>
          </Field>
          <Field label="Opening balance" required error={tried && errors.opening_balance} htmlFor="ac-open" hint={locked ? "Locked: the account has transactions" : "From the bank statement or a cash count"}><MoneyInput id="ac-open" value={f.opening_balance} disabled={locked} onChange={(v) => set("opening_balance", v)} /></Field>
          <Field label="On" required error={tried && errors.opening_date} htmlFor="ac-odate"><input id="ac-odate" type="date" className={inputCls} disabled={locked} value={f.opening_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("opening_date", e.target.value)} /></Field>
          <Field label="Restricted to a funding source" className="sm:col-span-2" htmlFor="ac-fund" hint="A donor account: only money of this funding source comes in or goes out">
            <select id="ac-fund" className={inputCls} value={f.funding_source} onChange={(e) => set("funding_source", e.target.value)}>
              <option value="">Unrestricted</option>
              {(ref.data?.funds || []).map((x: any) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} />
            Default for {bank ? "bank" : "cash"} payments
          </label>
          {account && (
            <Field label="Status" htmlFor="ac-status" hint="An account can be closed once it holds nothing">
              <select id="ac-status" className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
          )}
          <Field label="Notes" className={account ? "sm:col-span-2" : "sm:col-span-3"} htmlFor="ac-notes"><textarea id="ac-notes" className={cn(textareaCls, "min-h-[60px]")} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <p className="flex items-start gap-2 text-[12px] text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-ralga-navy" /> The opening balance must be the balance on the bank statement (or counted) on the opening date, so that the first reconciliation agrees.</p>
      </FormBlock>
    </FormDialog>
  );
}
