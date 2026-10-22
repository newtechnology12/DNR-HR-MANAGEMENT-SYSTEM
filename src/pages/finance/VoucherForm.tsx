/**
 * New / edit payment voucher. Supplier invoices: pick the supplier, tick the approved invoices and the
 * amount to pay on each. Direct expense: payee, budget line, amount, description. Statutory payment: tick
 * the liabilities owed to one authority (PAYE, withholding tax, VAT to RRA; contributions to RSSB) and the
 * month paid for. Withholding tax comes from the dated tax table and is computed on the amount before VAT;
 * the server recomputes everything.
 */
import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, CornerUpLeft, FileCheck2, Info, Landmark, Receipt, ShieldCheck, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { AUTHORITIES, BANK_LABELS, StatutoryAccount, VOUCHER_TYPES, payablesApi, withholdingRates } from "@/lib/payables";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { ChoiceCards, FileDrop } from "@/components/portal/kit";
import { BudgetLinePicker } from "@/components/budget/BudgetKit";
import { cn } from "@/utils";
import {
  ButtonLink,
  Card,
  Column,
  DataTable,
  DatePicker,
  DocNo,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  MoneyInput,
  Num,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  Textarea,
  checkboxClass,
  fmtDate,
  fmtMoney,
  overdue,
} from "@/components/ims";

type Pick = { invoice: string; amount: string; checked: boolean };
type Due = { amount: string; checked: boolean };
const LIST = "/dashboard/finance/vouchers";

// Statutory payments are declared and paid by the 15th of the month after the month they are for.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const now = new Date();
const RECENT_MONTHS = Array.from({ length: 13 }, (_, i) => monthLabel(new Date(now.getFullYear(), now.getMonth() - i, 1)));
const LAST_MONTH = RECENT_MONTHS[1];
function dueFor(period: string) {
  const [m, y] = period.split(" ");
  const i = MONTHS.indexOf(m);
  return i < 0 || !Number(y) ? "" : new Date(Date.UTC(Number(y), i + 1, 15)).toISOString().slice(0, 10);
}
const AUTHORITY_ORDER = ["RRA", "RSSB", "Other"];

export default function VoucherForm() {
  const { voucherId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const editing = Boolean(voucherId);

  const existing = useQuery(["voucher", voucherId], () => pocketbase.collection("payment_vouchers").getOne(voucherId!), { enabled: editing });
  const [type, setType] = React.useState<string>(params.get("type") || "invoice");
  const [supplier, setSupplier] = React.useState(params.get("supplier") || "");
  const [picks, setPicks] = React.useState<Record<string, Pick>>({});
  const [dues, setDues] = React.useState<Record<string, Due>>({});
  const [period, setPeriod] = React.useState(LAST_MONTH);
  const [payeeName, setPayeeName] = React.useState("");
  const [payeeBank, setPayeeBank] = React.useState<Record<string, string>>({});
  const [budgetLine, setBudgetLine] = React.useState("");
  const [gross, setGross] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [wht, setWht] = React.useState("");
  const [dueDate, setDueDate] = React.useState(!editing && params.get("type") === "statutory" ? dueFor(LAST_MONTH) : "");
  const [notes, setNotes] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState<"submit" | "draft" | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const v: any = existing.data;
    if (!v) return;
    setType(v.voucher_type);
    setSupplier(v.supplier || "");
    if (v.voucher_type === "invoice") setPicks(Object.fromEntries((v.lines || []).map((l: any) => [l.invoice, { invoice: l.invoice, amount: String(l.amount), checked: true }])));
    if (v.voucher_type === "statutory") {
      setDues(Object.fromEntries((v.lines || []).map((l: any) => [l.account, { amount: String(l.amount), checked: true }])));
      if (v.lines?.[0]?.period) setPeriod(v.lines[0].period);
    }
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
  const statutory = useQuery(["statutory-accounts", voucherId], () => payablesApi.statutory(voucherId), { enabled: type === "statutory" });
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
    else if (a > x.open) lineErrors[x.id] = `At most ${fmtMoney(x.open)}`;
  }
  // Statutory: the liabilities with something owed (or already on this voucher), RRA first, then RSSB.
  const dueRows: StatutoryAccount[] = (statutory.data?.items || [])
    .filter((x) => x.owed > 0 || dues[x.id]?.checked)
    .sort((a, b) => AUTHORITY_ORDER.indexOf(a.authority) - AUTHORITY_ORDER.indexOf(b.authority) || a.code.localeCompare(b.code));
  const chosenDues = dueRows.filter((x) => dues[x.id]?.checked);
  const authority = chosenDues[0]?.authority || "";
  const dueErrors: Record<string, string> = {};
  for (const x of chosenDues) {
    const a = Math.round(Number(dues[x.id].amount) || 0);
    if (a <= 0) dueErrors[x.id] = "Enter the amount";
    else if (a > x.available) dueErrors[x.id] = `At most ${fmtMoney(x.available)}`;
  }
  const totals = type === "invoice"
    ? chosen.reduce((t, x) => {
        const a = Math.round(Number(picks[x.id].amount) || 0);
        const base = x.total > 0 ? Math.round((a * x.subtotal) / x.total) : a;
        return { gross: t.gross + a, base: t.base + base };
      }, { gross: 0, base: 0 })
    : type === "statutory"
      ? { gross: chosenDues.reduce((t, x) => t + Math.round(Number(dues[x.id].amount) || 0), 0), base: 0 }
      : { gross: Math.round(Number(gross) || 0), base: Math.round(Number(gross) || 0) };
  const whtAmount = type === "statutory" ? 0 : Math.round((totals.base * rate) / 100);

  const errors = {
    supplier: type === "invoice" && !supplier && "Choose the supplier to pay.",
    invoices: type === "invoice" && !chosen.length && "Tick at least one invoice to pay.",
    lines: type === "invoice" && Object.keys(lineErrors).length > 0 && "Check the amount on each ticked invoice: above 0 and not more than what is unpaid.",
    payee: type !== "invoice" && !supplier && !payeeName.trim() && (type === "statutory" ? "Enter who is paid: Rwanda Revenue Authority (RRA) or Rwanda Social Security Board (RSSB)." : "Enter the payee's name, or choose a registered supplier."),
    dues: type === "statutory" && !chosenDues.length && "Tick at least one liability to pay.",
    dueLines: type === "statutory" && Object.keys(dueErrors).length > 0 && "Check the amount on each ticked line: above 0 and not more than what is still owed.",
    budgetLine: type === "direct" && !budgetLine && "Choose the budget line that pays for it.",
    gross: type === "direct" && !(Number(gross) > 0) && "Enter the amount to pay.",
    description: type === "direct" && description.trim().length < 5 && "Describe what is being paid, in at least 5 characters.",
  };
  const invalid = Object.values(errors).some(Boolean);
  const firstBadLine = chosen.find((x) => lineErrors[x.id]);
  const firstBadDue = chosenDues.find((x) => dueErrors[x.id]);
  const fieldOf: Record<keyof typeof errors, string> = {
    supplier: "supplier",
    invoices: supplier ? "invoices" : "supplier",
    lines: firstBadLine ? `pick-${firstBadLine.id}` : "invoices",
    payee: "payee_name",
    dues: "dues",
    dueLines: firstBadDue ? `due-${firstBadDue.id}` : "dues",
    budgetLine: "budget_line",
    gross: "gross",
    description: "description",
  };
  const shownErrors: FormError[] = tried ? (Object.entries(errors).filter(([, m]) => m) as [keyof typeof errors, string][]).map(([k, m]) => ({ field: fieldOf[k], message: m })) : [];
  const summaryErrors: FormError[] = [...shownErrors, ...(error ? [{ message: error }] : [])];
  const err = (k: keyof typeof errors) => (tried && errors[k]) || null;

  async function save(submit: boolean) {
    setTried(true);
    setError("");
    if (invalid) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(submit ? "submit" : "draft");
    try {
      const body = new FormData();
      body.append("voucher_type", type);
      body.append("supplier", supplier);
      body.append("wht_code", type === "statutory" ? "" : wht);
      body.append("due_date", dueDate ? `${dueDate} 00:00:00.000Z` : "");
      body.append("notes", notes);
      body.append("description", description);
      if (type === "invoice") {
        body.append("lines", JSON.stringify(chosen.map((x) => ({ invoice: x.id, amount: Math.round(Number(picks[x.id].amount)) }))));
      } else if (type === "statutory") {
        body.append("lines", JSON.stringify(chosenDues.map((x) => ({ account: x.id, amount: Math.round(Number(dues[x.id].amount)), period }))));
        body.append("budget_line", "");
        body.append("payee_name", supplier ? "" : payeeName.trim());
        body.append("payee_bank", JSON.stringify(supplier ? {} : payeeBank));
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
          toast.success(`${v.number} submitted for approval`);
        } catch (e) {
          toast.error(`${v.number} saved as a draft but not submitted: ${errorMessage(e)}`);
          navigate(`${LIST}/${v.id}`);
          return;
        }
      } else toast.success(`${v.number} saved as a draft`);
      navigate(`${LIST}/${v.id}`);
    } catch (e) {
      setError(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(null);
    }
  }

  if (!can("manage_payment_vouchers")) {
    return (
      <Page narrow>
        <Card>
          <EmptyState icon={FileCheck2} text="Payment vouchers are prepared by the Accountant." action={<ButtonLink to={LIST}>Back to payment vouchers</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  if (editing && existing.isLoading) {
    return (
      <Page narrow>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  const ev: any = existing.data;
  if (ev && !["draft", "returned"].includes(ev.status)) {
    return (
      <Page narrow>
        <Card>
          <EmptyState
            icon={FileCheck2}
            text={`${ev.number} is already in approval or closed, so it can no longer be edited. Only drafts and returned vouchers can be changed.`}
            action={<ButtonLink to={`${LIST}/${ev.id}`} variant="primary">Open {ev.number}</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const keptFiles: string[] = (ev?.attachments || []).filter((f: string) => !removed.includes(f));

  const invoiceColumns: Column<any>[] = [
    {
      key: "pick",
      header: <span className="sr-only">Pay</span>,
      width: "44px",
      total: null,
      cell: (x) => {
        const p = picks[x.id];
        return (
          <input
            type="checkbox"
            className={checkboxClass}
            checked={Boolean(p?.checked)}
            disabled={!x.open && !p?.checked}
            onChange={(e) => setPicks((all) => ({ ...all, [x.id]: { invoice: x.id, amount: all[x.id]?.amount || String(x.open), checked: e.target.checked } }))}
            aria-label={`Pay ${x.number}`}
          />
        );
      },
    },
    { key: "invoice", header: "Invoice", nowrap: true, cell: (x) => <DocNo value={x.number} />, sub: (x) => `Ref. ${x.supplier_invoice_number} · ${fmtDate(x.invoice_date)}`, total: "To pay" },
    {
      key: "due",
      header: "Due",
      nowrap: true,
      cell: (x) => fmtDate(x.due_date),
      sub: (x) => {
        const late = overdue(x.due_date);
        return late ? <span className="font-semibold text-ims-danger">{late}</span> : null;
      },
    },
    { key: "total", header: "Total (RWF)", numeric: true, cell: (x) => <span className="text-ims-muted"><Num value={x.total} /></span> },
    { key: "balance", header: "Unpaid (RWF)", numeric: true, cell: (x) => <span className="font-semibold"><Num value={x.balance} /></span> },
    { key: "held", header: "On other vouchers (RWF)", numeric: true, cell: (x) => (x.held ? <Num value={x.held} /> : <span className="text-ims-faint">—</span>) },
    {
      key: "amount",
      header: "Pay now (RWF)",
      width: "190px",
      cell: (x) => {
        const p = picks[x.id];
        const id = `pick-${x.id}`;
        const bad = tried && lineErrors[x.id];
        return (
          <>
            <label htmlFor={id} className="sr-only">Amount for {x.number}</label>
            <MoneyInput
              id={id}
              value={p?.amount === undefined || p.amount === "" ? "" : Number(p.amount)}
              disabled={!p?.checked}
              invalid={Boolean(bad)}
              onChange={(n) => setPicks((all) => ({ ...all, [x.id]: { ...all[x.id], amount: n === "" ? "" : String(n) } }))}
            />
            {bad && <span className="mt-0.5 block text-right text-t-hint text-ims-danger">{lineErrors[x.id]}</span>}
          </>
        );
      },
      total: <Num value={totals.gross} />,
    },
  ];

  const payees = Object.values(AUTHORITIES).map((a) => a.payee).filter(Boolean);
  const dueColumns: Column<StatutoryAccount>[] = [
    {
      key: "pick",
      header: <span className="sr-only">Pay</span>,
      width: "44px",
      total: null,
      cell: (x) => {
        const d = dues[x.id];
        const otherAuthority = Boolean(authority) && x.authority !== authority && !d?.checked;
        return (
          <input
            type="checkbox"
            className={checkboxClass}
            checked={Boolean(d?.checked)}
            disabled={(!x.available && !d?.checked) || otherAuthority}
            title={otherAuthority ? `Paid to ${AUTHORITIES[x.authority]?.label}: prepare another voucher.` : undefined}
            onChange={(e) => {
              const checked = e.target.checked;
              setDues((all) => ({ ...all, [x.id]: { amount: all[x.id]?.amount || String(x.available), checked } }));
              // the authority paid becomes the payee, unless another name was typed
              const payee = AUTHORITIES[x.authority]?.payee;
              if (checked && payee && !supplier && (!payeeName.trim() || payees.includes(payeeName))) setPayeeName(payee);
            }}
            aria-label={`Pay ${x.code} ${x.name}`}
          />
        );
      },
    },
    {
      key: "liability",
      header: "Liability",
      cell: (x) => (
        <span>
          <span className="mr-1.5 font-mono text-t-small font-semibold text-ims-text">{x.code}</span>
          {x.name}
        </span>
      ),
      sub: (x) => `Paid to ${AUTHORITIES[x.authority]?.label === "Other" ? "the body it is owed to" : AUTHORITIES[x.authority]?.label}`,
      total: "To pay",
    },
    { key: "owed", header: "Owed (RWF)", numeric: true, cell: (x) => <span className="font-semibold"><Num value={x.owed} /></span> },
    { key: "held", header: "On other vouchers", numeric: true, cell: (x) => (x.held ? <Num value={x.held} /> : <span className="text-ims-faint">—</span>) },
    {
      key: "amount",
      header: "Pay now (RWF)",
      width: "176px",
      cell: (x) => {
        const d = dues[x.id];
        const bad = tried && dueErrors[x.id];
        return (
          <>
            <MoneyInput
              id={`due-${x.id}`}
              aria-label={`Amount for ${x.code} ${x.name}`}
              value={d?.amount === undefined || d.amount === "" ? "" : Number(d.amount)}
              disabled={!d?.checked}
              invalid={Boolean(bad)}
              onChange={(n) => setDues((all) => ({ ...all, [x.id]: { ...all[x.id], amount: n === "" ? "" : String(n) } }))}
            />
            {bad && <span className="mt-0.5 block text-right text-t-hint text-ims-danger">{dueErrors[x.id]}</span>}
          </>
        );
      },
      total: <Num value={totals.gross} />,
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Payables", to: "/dashboard/finance/invoices" },
          { label: "Payment vouchers", to: LIST },
          { label: editing ? `Edit ${ev?.number || ""}`.trim() : "New payment voucher" },
        ]}
        title={editing ? `Edit ${ev?.number || "voucher"}` : "New payment voucher"}
        subtitle="Choose what is paid and to whom. The server recomputes every amount, the tax withheld and the bank details."
      />

      {ev?.status === "returned" && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>This voucher was returned for changes. Update it and submit it again; approval starts again from the first step.</span>
        </p>
      )}

      <ErrorSummary errors={summaryErrors} title={shownErrors.length ? "Check these fields before you submit" : "The voucher could not be saved"} />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
        className="flex flex-col gap-4"
      >
        <FormBody
          aside={
            <SummaryPanel
              rows={
                type === "statutory"
                  ? [
                      ["Liabilities paid", chosenDues.length ? `${chosenDues.length} · ${AUTHORITIES[authority]?.label || ""}` : "—"],
                      ["For the month of", period],
                      ["Withholding tax", "None"],
                      ["Net to the payee", fmtMoney(totals.gross)],
                    ]
                  : [
                      ["Gross amount", fmtMoney(totals.gross)],
                      ["Taxable before VAT", fmtMoney(totals.base)],
                      [`Withholding tax${rate ? ` (${rate}%)` : ""}`, whtAmount ? `− ${fmtMoney(whtAmount)}` : "—"],
                      ["Net to the payee", fmtMoney(totals.gross - whtAmount)],
                    ]
              }
              checklist={
                type === "invoice"
                  ? [
                      { label: "Supplier", done: !errors.supplier },
                      { label: "Invoices to pay", done: !errors.invoices },
                      { label: "Amounts within what is unpaid", done: !errors.invoices && !errors.lines },
                    ]
                  : type === "statutory"
                  ? [
                      { label: "Who is paid", done: !errors.payee },
                      { label: "Liabilities to pay", done: !errors.dues },
                      { label: "Amounts within what is owed", done: !errors.dues && !errors.dueLines },
                    ]
                  : [
                      { label: "Payee", done: !errors.payee },
                      { label: "Budget line", done: !errors.budgetLine },
                      { label: "Amount", done: !errors.gross },
                      { label: "What is paid", done: !errors.description },
                    ]
              }
            >
              <p className="mt-4 border-t border-ims-divider pt-4 text-t-small text-ims-muted">
                Approved by the Director of Finance, and by the Secretary General above the DAF limit. The Cashier then pays it; whoever prepared or approved it cannot.
              </p>
            </SummaryPanel>
          }
        >
          <FormSection title="What is paid">
            <ChoiceCards<string>
              columns={Object.keys(VOUCHER_TYPES).length > 2 ? 3 : 2}
              value={type}
              onChange={(t) => {
                setType(t);
                setTried(false);
                // statutory payments carry no withholding tax and are due by the 15th of the next month
                if (t === "statutory") {
                  setWht("");
                  if (!dueDate) setDueDate(dueFor(period));
                }
              }}
              options={Object.entries(VOUCHER_TYPES).map(([value, t]) => ({ value, label: t.label, description: t.hint }))}
            />
          </FormSection>

          <FormSection
            title="Payee"
            description={
              type === "invoice"
                ? "The supplier whose approved invoices are paid."
                : type === "statutory"
                  ? "The authority paid: RRA for PAYE, withholding tax and VAT; RSSB for social security contributions."
                  : "A registered supplier, or anyone else with their bank details."
            }
          >
            <Field
              label={type === "invoice" ? "Supplier" : "Registered supplier"}
              required={type === "invoice"}
              htmlFor="supplier"
              error={err("supplier")}
              hint={type === "direct" ? "Optional. Leave it empty to pay someone who is not a registered supplier." : type === "statutory" ? "Optional: RRA or RSSB, if registered with verified bank details." : undefined}
            >
              <Select
                id="supplier"
                value={supplier}
                invalid={Boolean(err("supplier"))}
                onChange={(e) => {
                  setSupplier(e.target.value);
                  setPicks({});
                }}
              >
                <option value="">{type === "invoice" ? "Choose the supplier" : "Not a registered supplier"}</option>
                {(suppliers.data || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}{s.tin ? ` · TIN ${s.tin}` : ""}</option>
                ))}
              </Select>
            </Field>
            {sup && (
              <div className="rounded-control border border-ims-border bg-ims-thead px-4 py-3 text-t-small">
                <p className="mb-1 flex items-center gap-1.5 font-semibold text-ims-text"><ShieldCheck size={15} className="text-ims-success" aria-hidden /> Verified bank details: paid to this account</p>
                <p className="text-ims-body">
                  {sup.bank_name || "—"}{sup.bank_branch ? `, ${sup.bank_branch}` : ""} · <span className="font-mono">{sup.bank_account_number || "no account on file"}</span>{sup.bank_account_name ? ` · ${sup.bank_account_name}` : ""}
                </p>
                {sup.bank_change_pending && (
                  <p className="mt-1 flex items-start gap-1 text-ims-warning">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> A change of bank details is waiting for Finance; this voucher uses the verified account above.
                  </p>
                )}
              </div>
            )}
            {type !== "invoice" && !supplier && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Payee name" required htmlFor="payee_name" error={err("payee")} className="sm:col-span-2" hint={type === "statutory" ? "Filled in when you tick what is paid." : undefined}>
                  <Input id="payee_name" value={payeeName} invalid={Boolean(err("payee"))} onChange={(e) => setPayeeName(e.target.value)} placeholder={type === "statutory" ? "For example: Rwanda Revenue Authority (RRA)" : "For example: Rwanda Energy Group (REG)"} />
                </Field>
                {BANK_LABELS.map(([k, label]) => (
                  <Field key={k} label={label} htmlFor={`bank-${k}`}>
                    <Input id={`bank-${k}`} className={cn(k === "bank_account_number" && "font-mono")} value={payeeBank[k] || ""} onChange={(e) => setPayeeBank((b) => ({ ...b, [k]: e.target.value }))} />
                  </Field>
                ))}
                {type === "statutory" && (
                  <p className="flex items-start gap-1.5 text-t-small text-ims-muted sm:col-span-2">
                    <Info size={14} className="mt-0.5 shrink-0" aria-hidden /> The authority's collection account is needed to pay by bank transfer; without it the Cashier pays by cheque.
                  </p>
                )}
              </div>
            )}
          </FormSection>

          {type === "invoice" ? (
            <FormSection id="invoices" title="Invoices to pay" description="Approved, unpaid invoices of this supplier. Tick each one and the amount to pay now.">
              {tried && (errors.invoices || errors.lines) && (
                <p role="alert" className="flex items-start gap-1 text-t-hint text-ims-danger">
                  <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden /> {errors.invoices || errors.lines}
                </p>
              )}
              {!supplier ? (
                <EmptyState compact icon={Receipt} text="Choose the supplier to see its approved, unpaid invoices." className="rounded-control border border-dashed border-ims-field" />
              ) : (
                <div className="-mx-[18px] border-y border-ims-border sm:-mx-5">
                  <DataTable
                    columns={invoiceColumns}
                    rows={payable.data?.items || []}
                    rowKey={(x) => x.id}
                    rowClassName={(x) => (picks[x.id]?.checked ? "bg-ims-info-bg/40" : undefined)}
                    loading={payable.isLoading}
                    error={payable.isError ? payable.error : undefined}
                    onRetry={() => payable.refetch()}
                    minWidth={860}
                    caption="Approved invoices to pay"
                    empty={<EmptyState compact icon={Receipt} text="No approved invoice of this supplier is waiting for payment." />}
                  />
                </div>
              )}
            </FormSection>
          ) : type === "statutory" ? (
            <FormSection id="dues" title="What is paid over" description="What the ledger says is owed on each liability, less what other open vouchers already hold. Tick each line and the amount to pay now.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="For the month of" required htmlFor="period" hint="Declared and paid by the 15th of the following month.">
                  <Select
                    id="period"
                    value={period}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (!dueDate || dueDate === dueFor(period)) setDueDate(dueFor(next));
                      setPeriod(next);
                    }}
                  >
                    {(RECENT_MONTHS.includes(period) ? RECENT_MONTHS : [period, ...RECENT_MONTHS]).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              {tried && (errors.dues || errors.dueLines) && (
                <p role="alert" className="flex items-start gap-1 text-t-hint text-ims-danger">
                  <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden /> {errors.dues || errors.dueLines}
                </p>
              )}
              <div className="-mx-[18px] border-y border-ims-border sm:-mx-5">
                <DataTable
                  columns={dueColumns}
                  rows={dueRows}
                  rowKey={(x) => x.id}
                  rowClassName={(x) => (dues[x.id]?.checked ? "bg-ims-info-bg/40" : undefined)}
                  loading={statutory.isLoading}
                  error={statutory.isError ? statutory.error : undefined}
                  onRetry={() => statutory.refetch()}
                  minWidth={640}
                  caption="Liabilities to pay"
                  empty={<EmptyState compact icon={Landmark} text="Nothing is owed to RRA or RSSB: the PAYE, contributions and tax withheld recorded in the ledger are paid up." />}
                />
              </div>
              {authority && (
                <p className="flex items-start gap-1.5 text-t-small text-ims-muted">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden /> One voucher pays one authority: this one pays {AUTHORITIES[authority]?.label === "Other" ? "other deductions" : AUTHORITIES[authority]?.label}. Prepare another voucher for the rest.
                </p>
              )}
            </FormSection>
          ) : (
            <FormSection title="Budget and amount">
              <Field label="Budget line" required htmlFor="budget_line" error={err("budgetLine")} hint="The money comes from this line. The amount is checked against what is left on it.">
                <BudgetLinePicker id="budget_line" invalid={Boolean(err("budgetLine"))} value={budgetLine} onChange={setBudgetLine} amount={Number(gross) || undefined} anyDepartment />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Amount" required htmlFor="gross" error={err("gross")} hint="VAT included, if any.">
                  <MoneyInput id="gross" value={gross === "" ? "" : Number(gross)} invalid={Boolean(err("gross"))} onChange={(n) => setGross(n === "" ? "" : String(n))} />
                </Field>
              </div>
              <Field label="What is paid" required htmlFor="description" error={err("description")}>
                <Textarea id="description" className="min-h-[80px]" value={description} invalid={Boolean(err("description"))} onChange={(e) => setDescription(e.target.value)} placeholder="For example: electricity, head office, October 2026 (meter 0412337)" />
              </Field>
            </FormSection>
          )}

          <FormSection title={type === "statutory" ? "Terms" : "Tax and terms"}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {type !== "statutory" && (
                <Field
                  label="Withholding tax"
                  htmlFor="wht"
                  hint={rateRec && !rateRec.confirmed_by_finance ? "This rate is not yet confirmed by Finance (Setup › Tax and statutory rates)." : "From the dated tax table; worked out on the amount before VAT."}
                >
                  <Select id="wht" value={wht} onChange={(e) => setWht(e.target.value)}>
                    <option value="">No withholding</option>
                    {(rates.data || []).map((r: any) => (
                      <option key={r.id} value={r.code}>{r.name} · {r.rate}%</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Pay by" htmlFor="due_date" hint={type === "statutory" ? "Late payment of PAYE and contributions carries penalties and interest." : "Optional."}>
                <DatePicker id="due_date" value={dueDate} onChange={setDueDate} placeholder="No date" clearable />
              </Field>
            </div>
            {type !== "direct" && (
              <Field label="Description" htmlFor="description" hint={type === "statutory" ? "Filled in from the liabilities and the month when left empty." : "Filled in from the invoices when left empty."}>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            )}
            <Field label="Notes for the approvers" htmlFor="notes">
              <Textarea id="notes" className="min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FormSection>

          <FormSection title="Supporting documents" description="Invoice, delivery note, contract. Up to 10 files of 20 MB each.">
            {keptFiles.length > 0 && (
              <ul className="space-y-1.5">
                {keptFiles.map((f) => (
                  <li key={f} className="flex items-center justify-between gap-2 rounded-control border border-ims-border px-3 py-2 text-t-body">
                    <a className="truncate font-semibold text-ims-link hover:underline" href={pocketbase.files.getUrl(ev, f)} target="_blank" rel="noreferrer">{f}</a>
                    <button type="button" onClick={() => setRemoved((r) => [...r, f])} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ims-muted hover:bg-ims-danger-bg hover:text-ims-danger" aria-label={`Remove ${f}`}>
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FileDrop files={files} onChange={setFiles} accept="" max={10} hint="Click to choose files or drag them here · up to 20 MB each" />
          </FormSection>
        </FormBody>

        <FormActions
          submitType="submit"
          onSaveDraft={() => save(false)}
          cancelTo={editing ? `${LIST}/${voucherId}` : LIST}
          busy={busy}
          note="Save a draft to finish later."
        />
      </form>
    </Page>
  );
}
