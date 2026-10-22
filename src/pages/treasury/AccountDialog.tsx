/**
 * Set up or change a bank account or cash book (Director of Finance). Once an account has transactions its
 * type, GL account and opening balance are locked by the server.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Landmark, ShieldCheck, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { Button, Checkbox, DatePicker, Field, Input, Modal, ModalSection, Select, Textarea } from "@/components/ims";
import { MoneyInput } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const blank = { kind: "bank" as "bank" | "cash", code: "", name: "", bank_name: "", branch: "", account_number: "", account_name: "", swift_code: "", gl_account: "", funding_source: "", opening_balance: "" as number | "", opening_date: "", custodian: "", cash_limit: "" as number | "", signatories: "", is_default: false, status: "active", notes: "" };

const KINDS = [
  { value: "bank" as const, label: "Bank account", description: "Reconciled with the bank statement every month", icon: Landmark },
  { value: "cash" as const, label: "Cash book", description: "Petty cash in the office, checked by a cash count", icon: Wallet },
];

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
    code: !/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(f.code.trim()) && "Use 2–20 letters, digits or dashes, for example BK-OPS.",
    name: f.name.trim().length < 3 && "Enter the account name (at least 3 characters).",
    bank_name: bank && !f.bank_name.trim() && "Enter the bank.",
    account_number: bank && !/^[0-9][0-9 -]{4,33}$/.test(f.account_number.trim()) && "Use digits, spaces or dashes only.",
    custodian: !bank && !f.custodian && "Choose who holds the cash.",
    gl_account: !f.gl_account ? "Choose the cash account in the chart of accounts." : usedGl.some((a: any) => a.gl_account === f.gl_account) ? `Already used by ${usedGl.find((a: any) => a.gl_account === f.gl_account).code}: choose another cash account.` : "",
    opening_date: !f.opening_date ? "Enter the opening date." : f.opening_date > new Date().toISOString().slice(0, 10) ? "Choose today or a date in the past." : "",
    opening_balance: f.opening_balance === "" && "Enter the opening balance (0 for a new account).",
  };
  const invalid = Object.values(errors).some(Boolean);
  const err = (k: keyof typeof errors) => (tried ? errors[k] || null : null);

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
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={account ? <>Change <span className="whitespace-nowrap">{account.code}</span></> : "New bank account or cash book"}
      description="Only the Director of Finance sets up accounts. Every change is kept in the audit log."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{account ? "Save changes" : "Set up account"}</Button>
        </>
      }
    >
      {tried && invalid && (
        <p role="alert" className="rounded-control border border-ims-danger/40 bg-ims-danger-bg px-3.5 py-2.5 text-t-small font-semibold text-ims-danger">
          Check the fields marked in red before you save.
        </p>
      )}
      {!account && (
        <div role="radiogroup" aria-label="Type of account" className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => {
            const on = f.kind === k.value;
            return (
              <label key={k.value} className={cn("flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 transition-colors focus-within:ring-2 focus-within:ring-ims-focus", on ? "border-ims-link bg-ims-info-bg" : "border-ims-field bg-ims-card hover:bg-ims-hover")}>
                <input type="radio" name="account-kind" className="sr-only" checked={on} onChange={() => set("kind", k.value)} />
                <k.icon size={18} className={cn("mt-0.5 shrink-0", on ? "text-ims-primary" : "text-ims-muted")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-t-body font-bold text-ims-text">{k.label}</span>
                  <span className="block text-t-small text-ims-muted">{k.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <ModalSection title={bank ? "Bank account" : "Cash book"}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" required error={err("code")} htmlFor="ac-code" hint="Short name used everywhere">
            <Input id="ac-code" className="font-mono" value={f.code} onChange={(e) => set("code", e.target.value)} placeholder={bank ? "BK-OPS" : "PC-HQ"} invalid={Boolean(err("code"))} />
          </Field>
          <Field label="Name" required error={err("name")} className="sm:col-span-2" htmlFor="ac-name">
            <Input id="ac-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={bank ? "Operating account" : "Petty cash — Head Office"} invalid={Boolean(err("name"))} />
          </Field>
          {bank ? (
            <>
              <Field label="Bank" required error={err("bank_name")} htmlFor="ac-bank">
                <Input id="ac-bank" value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Bank of Kigali" invalid={Boolean(err("bank_name"))} />
              </Field>
              <Field label="Branch" htmlFor="ac-branch"><Input id="ac-branch" value={f.branch} onChange={(e) => set("branch", e.target.value)} /></Field>
              <Field label="SWIFT / BIC" htmlFor="ac-swift"><Input id="ac-swift" className="font-mono" value={f.swift_code} onChange={(e) => set("swift_code", e.target.value)} /></Field>
              <Field label="Account number" required error={err("account_number")} htmlFor="ac-number">
                <Input id="ac-number" className="font-mono" value={f.account_number} onChange={(e) => set("account_number", e.target.value)} invalid={Boolean(err("account_number"))} />
              </Field>
              <Field label="Account name at the bank" className="sm:col-span-2" htmlFor="ac-aname"><Input id="ac-aname" value={f.account_name} onChange={(e) => set("account_name", e.target.value)} /></Field>
              <Field label="Signatories" className="sm:col-span-3" htmlFor="ac-sign" hint="Who signs payments from this account">
                <Input id="ac-sign" value={f.signatories} onChange={(e) => set("signatories", e.target.value)} placeholder="Any two of: Secretary General, Director of Finance…" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Custodian" required error={err("custodian")} className="sm:col-span-2" htmlFor="ac-cust">
                <Select id="ac-cust" value={f.custodian} onChange={(e) => set("custodian", e.target.value)} invalid={Boolean(err("custodian"))}>
                  <option value="">Choose who holds the cash</option>
                  {(ref.data?.users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              <Field label="Cash limit" htmlFor="ac-limit" hint="The most cash kept; shown in red above it"><MoneyInput id="ac-limit" value={f.cash_limit} onChange={(v) => set("cash_limit", v)} /></Field>
            </>
          )}
        </div>
      </ModalSection>

      <ModalSection title="Accounting">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="GL cash account" required error={err("gl_account")} htmlFor="ac-gl" hint={locked ? "Locked: the account has transactions" : "Asset account with cash flow class “cash”"}>
            <Select id="ac-gl" value={f.gl_account} disabled={locked} onChange={(e) => set("gl_account", e.target.value)} invalid={Boolean(err("gl_account"))}>
              <option value="">Choose an account</option>
              {(ref.data?.gl || []).map((g: any) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
            </Select>
          </Field>
          <Field label="Opening balance" required error={err("opening_balance")} htmlFor="ac-open" hint={locked ? "Locked: the account has transactions" : "From the bank statement or a cash count"}>
            <MoneyInput id="ac-open" value={f.opening_balance} disabled={locked} onChange={(v) => set("opening_balance", v)} invalid={Boolean(err("opening_balance"))} />
          </Field>
          <Field label="On" required error={err("opening_date")} htmlFor="ac-odate">
            <DatePicker id="ac-odate" disabled={locked} value={f.opening_date} max={new Date().toISOString().slice(0, 10)} onChange={(v) => set("opening_date", v)} invalid={Boolean(err("opening_date"))} />
          </Field>
          <Field label="Restricted to a funding source" className="sm:col-span-2" htmlFor="ac-fund" hint="A donor account: only money of this funding source comes in or goes out">
            <Select id="ac-fund" value={f.funding_source} onChange={(e) => set("funding_source", e.target.value)}>
              <option value="">Unrestricted</option>
              {(ref.data?.funds || []).map((x: any) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </Select>
          </Field>
          <Checkbox className="self-end pb-2.5" id="ac-default" label={`Default for ${bank ? "bank" : "cash"} payments`} checked={f.is_default} onChange={(v) => set("is_default", v)} />
          {account && (
            <Field label="Status" htmlFor="ac-status" hint="An account can be closed once it holds nothing">
              <Select id="ac-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
          )}
          <Field label="Notes" className={account ? "sm:col-span-2" : "sm:col-span-3"} htmlFor="ac-notes">
            <Textarea id="ac-notes" className="min-h-[64px]" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
        <p className="flex items-start gap-2 text-t-small text-ims-muted">
          <ShieldCheck size={15} className="mt-px shrink-0 text-ims-primary" aria-hidden />
          The opening balance must be the balance on the bank statement (or counted) on the opening date, so that the first reconciliation agrees.
        </p>
      </ModalSection>
    </Modal>
  );
}
