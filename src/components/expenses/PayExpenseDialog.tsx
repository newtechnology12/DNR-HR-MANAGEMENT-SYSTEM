/**
 * The Cashier pays an approved staff expense or advance from a cash book: cash from petty cash, mobile money or a
 * bank transfer from a bank account. The cash book entry and the journal are written together by the server.
 */
import * as React from "react";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { EXPENSE_KIND, PAY_BY, expensesApi } from "@/lib/expenses";
import { Button, DatePicker, ErrorSummary, Field, FormError, Input, Modal, Select, fmtMoney, notify } from "@/components/ims";

const today = () => new Date().toISOString().slice(0, 10);

export default function PayExpenseDialog({ request, onClose, onPaid }: { request: any; onClose: () => void; onPaid: () => void }) {
  const accounts = useQuery(["pay-accounts"], () => pocketbase.collection("bank_accounts").getFullList({ filter: 'status = "active"', sort: "-is_default,code", fields: "id,code,name,kind,book_balance,funding_source,is_default" }), { staleTime: 30_000 });
  const [method, setMethod] = React.useState<string>(request.pay_by || "cash");
  const [account, setAccount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [reference, setReference] = React.useState("");
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [busy, setBusy] = React.useState(false);
  const kind = method === "cash" ? "cash" : "bank";
  // restricted donor accounts are refused by the server; staff costs are paid from unrestricted money
  const usable = ((accounts.data || []) as any[]).filter((a) => a.kind === kind && !a.funding_source);
  React.useEffect(() => {
    if (!usable.some((a) => a.id === account)) setAccount(usable[0]?.id || "");
  }, [method, accounts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = usable.find((a) => a.id === account);
  const amount = Math.round(request.amount);
  const who = request.expand?.employee?.name || "the member of staff";

  const pay = async () => {
    const out: FormError[] = [];
    if (!account) out.push({ field: "pay-account", message: kind === "cash" ? "Choose the cash book" : "Choose the bank account" });
    if (!date) out.push({ field: "pay-date", message: "Give the payment date" });
    if (method !== "cash" && reference.trim().length < 3) out.push({ field: "pay-ref", message: method === "mobile_money" ? "Enter the mobile money transaction ID" : "Enter the bank transfer reference" });
    if (chosen && chosen.book_balance < amount) out.push({ field: "pay-account", message: `${chosen.code} holds ${fmtMoney(chosen.book_balance)}; ${fmtMoney(amount)} is needed` });
    setErrors(out);
    if (out.length) return;
    setBusy(true);
    try {
      const r = await expensesApi.pay(request.id, { account, method, date, reference: reference.trim() });
      notify.success(`${r.number} paid: ${fmtMoney(amount)} to ${who}.`);
      onPaid();
    } catch (e) {
      setErrors([{ message: errorMessage(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Pay ${request.number}?`}
      description={`${EXPENSE_KIND[request.kind] || "Request"} of ${who} · ${fmtMoney(amount)}. The cash book and the general ledger are written together.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={pay}>Pay {fmtMoney(amount)}</Button></>}
    >
      <ErrorSummary errors={errors} title="Check these before paying" />
      <div className="rounded-control bg-ims-subtle px-3.5 py-2.5 text-t-body text-ims-body">
        Asked to be paid by <strong>{PAY_BY[request.pay_by] || "—"}</strong>
        {request.pay_by === "mobile_money" && request.momoNumber ? <> to <span className="font-mono">{request.momoNumber}</span>{request.momoName ? ` (${request.momoName})` : ""}</> : null}.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid by" required htmlFor="pay-method">
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAY_BY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label={kind === "cash" ? "From the cash book" : "From the bank account"} required htmlFor="pay-account" hint={chosen ? `Balance ${fmtMoney(chosen.book_balance)}` : undefined}>
          <Select id="pay-account" value={account} onChange={(e) => setAccount(e.target.value)} invalid={errors.some((x) => x.field === "pay-account")}>
            {!usable.length && <option value="">{accounts.isLoading ? "Loading…" : "No unrestricted account of this kind"}</option>}
            {usable.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </Select>
        </Field>
        <Field label="Payment date" required htmlFor="pay-date" hint="On or after the last reconciliation of the account.">
          <DatePicker id="pay-date" value={date} max={today()} onChange={setDate} />
        </Field>
        <Field label={method === "cash" ? "Petty cash voucher no." : method === "mobile_money" ? "Transaction ID" : "Transfer reference"} required={method !== "cash"} htmlFor="pay-ref">
          <Input id="pay-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder={method === "cash" ? "Optional" : ""} invalid={errors.some((x) => x.field === "pay-ref")} />
        </Field>
      </div>
    </Modal>
  );
}
