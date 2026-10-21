/**
 * Reconciliation screen for one account. Bank account: statement lines and cash book entries not yet
 * matched, side by side; select items on both sides with equal totals and match them, record bank charges
 * and interest straight from the statement, say what happens to each open item, and see the reconciliation
 * statement live. Cash book: count the cash and compare it with the book. Then prepare the reconciliation
 * for the DAF.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, FileSpreadsheet, Link2, Link2Off, ListChecks, MoreHorizontal, Receipt, Scale, Search, Sparkles, Wallet, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { ENTRY_TYPES, FOLLOW_UP, RecFigures, WorkItem, signed, treasuryApi } from "@/lib/treasury";
import { rwf, rwfSigned, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader } from "@/components/enterprise/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { Flow, KindIcon, MoneyInput, lastMonthEnd } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";
import ReceiptDialog, { ReceiptPrefill } from "./ReceiptDialog";
import StatementImport from "./StatementImport";

const today = () => new Date().toISOString().slice(0, 10);

export default function Reconcile() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [asOf, setAsOf] = React.useState("");
  const q = useQuery(["workspace", accountId, asOf], () => treasuryApi.workspace(accountId!, asOf || undefined), { keepPreviousData: true });
  const w = q.data;
  React.useEffect(() => {
    // Default date: the end of the last imported statement, or of last month.
    if (w && !asOf) setAsOf(w.statements[0]?.to && w.statements[0].to > (w.account.reconciled_to || "") ? w.statements[0].to : lastMonthEnd() > (w.account.reconciled_to || "") ? lastMonthEnd() : today());
  }, [w, asOf]);
  if (q.isLoading || !w) return <div className="p-6">{q.isError ? <EmptyState icon={Scale} title="Not available" text={(q.error as any)?.message || ""} /> : <ListSkeleton rows={8} />}</div>;
  const refresh = () => q.refetch();
  const prepare = can("prepare_bank_reconciliation");
  return w.account.kind === "cash"
    ? <CashCount w={w} asOf={asOf} setAsOf={setAsOf} canPrepare={prepare} onOpen={(id) => navigate(`/dashboard/treasury/reconciliations/${id}`)} />
    : <BankWorkspace w={w} asOf={asOf} setAsOf={setAsOf} canPrepare={prepare} canRecordReceipt={can("manage_treasury")} refresh={refresh} onOpen={(id) => navigate(`/dashboard/treasury/reconciliations/${id}`)} />;
}

function Header({ w, actions }: { w: any; actions?: React.ReactNode }) {
  const a = w.account;
  return (
    <PageHeader
      title={<span className="flex items-center gap-2.5"><KindIcon kind={a.kind} /> {a.kind === "cash" ? "Cash count" : "Reconcile"} · {a.code} {a.name}</span>}
      description={a.kind === "cash" ? `Count the cash with the custodian (${a.custodian_name || "—"}) and compare it with the cash book.` : `${a.bank_name} · ${a.account_number}. ${a.reconciled_to ? `Reconciled up to ${showDay(a.reconciled_to)}.` : "Not reconciled yet."}`}
      breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Accounts", link: "/dashboard/treasury/accounts" }, { title: a.code, link: `/dashboard/treasury/accounts/${a.id}` }, { title: a.kind === "cash" ? "Cash count" : "Reconcile", link: "#" }]}
      actions={actions}
    />
  );
}

// ------------------------------------------------------------------ bank
function BankWorkspace({ w, asOf, setAsOf, canPrepare, canRecordReceipt, refresh, onOpen }: { w: any; asOf: string; setAsOf: (d: string) => void; canPrepare: boolean; canRecordReceipt: boolean; refresh: () => void; onOpen: (id: string) => void }) {
  const [sel, setSel] = React.useState<{ lines: Set<string>; entries: Set<string> }>({ lines: new Set(), entries: new Set() });
  const [search, setSearch] = React.useState("");
  const [dir, setDir] = React.useState<"" | "in" | "out">("");
  const [busy, setBusy] = React.useState(false);
  const [recordLine, setRecordLine] = React.useState<WorkItem | null>(null);
  const [receiptFrom, setReceiptFrom] = React.useState<ReceiptPrefill | null>(null);
  const [followUp, setFollowUp] = React.useState<{ kind: "entry" | "line"; id: string }[] | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [showMatches, setShowMatches] = React.useState(false);
  const fig: RecFigures = w.reconciliation;

  React.useEffect(() => setSel({ lines: new Set(), entries: new Set() }), [w]);
  const toggle = (side: "lines" | "entries", id: string) => setSel((s) => {
    const next = new Set(s[side]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { ...s, [side]: next };
  });
  const selLines = w.lines.filter((l: WorkItem) => sel.lines.has(l.id));
  const selEntries = w.entries.filter((e: WorkItem) => sel.entries.has(e.id));
  const sumL = selLines.reduce((s: number, x: WorkItem) => s + signed(x.direction, x.amount), 0);
  const sumE = selEntries.reduce((s: number, x: WorkItem) => s + signed(x.direction, x.amount), 0);
  const any = selLines.length + selEntries.length > 0;
  const balanced = any && sumL === sumE && (selLines.length > 0 && selEntries.length > 0 ? true : selLines.length + selEntries.length >= 2 && sumL === 0 && sumE === 0);
  // With one statement line selected, cash book entries of the same amount and direction come first.
  const target = selLines.length === 1 && !selEntries.length ? selLines[0] : selEntries.length === 1 && !selLines.length ? selEntries[0] : null;
  const filt = (x: WorkItem) => (!dir || x.direction === dir) && (!search.trim() || `${x.description} ${x.reference} ${x.counterparty || ""} ${x.source_number || ""} ${x.amount}`.toLowerCase().includes(search.trim().toLowerCase()));
  const order = (list: WorkItem[], other: "lines" | "entries") => {
    const out = list.filter(filt);
    if (!target || (other === "lines" ? target.kind === "line" : target.kind === "entry")) return out;
    return [...out].sort((a, b) => Number(b.direction === target.direction && b.amount === target.amount) - Number(a.direction === target.direction && a.amount === target.amount));
  };
  const same = (x: WorkItem) => Boolean(target && x.kind !== target.kind && x.direction === target.direction && x.amount === target.amount);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const statementsBehind = !fig.has_statement || !fig.covered;
  return (
    <div className="space-y-4 px-3 pb-24 sm:px-4">
      <Header
        w={w}
        actions={
          <>
            {canPrepare && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileSpreadsheet size={14} /> Import statement</Button>}
            {canPrepare && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await treasuryApi.autoMatch(w.account.id); if (!r.matched) throw new Error(r.ambiguous ? `Nothing matched automatically: ${r.ambiguous} line(s) have several possible entries — match them by hand.` : "Nothing more to match automatically."); }, "Matched automatically")}><Sparkles size={14} /> Match automatically</Button>}
            {w.open_reconciliation ? (
              <Button size="sm" onClick={() => onOpen(w.open_reconciliation.id)}><Scale size={14} /> Open {w.open_reconciliation.number}</Button>
            ) : canPrepare && <Button size="sm" onClick={() => setPreparing(true)}><Scale size={14} /> Prepare reconciliation</Button>}
          </>
        }
      />

      <RecSummary fig={fig} asOf={asOf} setAsOf={setAsOf} min={w.account.reconciled_to ? w.account.reconciled_to : w.account.opening_date} />
      {fig.warnings.map((t: string) => <p key={t} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{t}</p>)}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-card">
        <span className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, reference, amount" className="h-9 w-64 max-w-full rounded-md border border-slate-200 pl-8 pr-2 text-[13px] focus:border-primary focus:outline-none" />
        </span>
        {(["", "in", "out"] as const).map((d) => (
          <button key={d || "all"} type="button" onClick={() => setDir(d)} className={cn("h-8 rounded-md px-2.5 text-[12.5px] font-medium", dir === d ? "bg-ralga-navy text-white" : "text-slate-600 hover:bg-slate-100")}>{d === "" ? "All" : d === "in" ? "Money in" : "Money out"}</button>
        ))}
        <span className="ml-auto text-[12px] text-slate-500">Automatic matching: same amount and direction within {w.match_days} days, the reference first.</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Side
          title="On the bank statement, not in the cash book yet"
          empty={statementsBehind ? "Import the bank statement to see its lines here." : "Every statement line is matched."}
          items={order(w.lines, "lines")}
          selected={sel.lines}
          onToggle={(id) => toggle("lines", id)}
          highlight={same}
          menu={(l) => (
            <>
              {canPrepare && <DropdownMenuItem onClick={() => setRecordLine(l)}><Receipt size={14} className="mr-2" /> {l.direction === "out" ? "Record as bank charge" : "Record as interest / other"}</DropdownMenuItem>}
              {canRecordReceipt && l.direction === "in" && <DropdownMenuItem onClick={() => setReceiptFrom({ account: w.account.id, receipt_date: l.date, amount: l.amount, reference: l.reference, description: l.description, statement_line: l.id })}><Wallet size={14} className="mr-2" /> Record as a receipt</DropdownMenuItem>}
              {canPrepare && <DropdownMenuItem onClick={() => setFollowUp([{ kind: "line", id: l.id }])}><ListChecks size={14} className="mr-2" /> Follow-up…</DropdownMenuItem>}
            </>
          )}
        />
        <Side
          title="In the cash book, not on the statement yet"
          empty="Every cash book entry is matched."
          items={order(w.entries, "entries")}
          selected={sel.entries}
          onToggle={(id) => toggle("entries", id)}
          highlight={same}
          menu={(e) => canPrepare && <DropdownMenuItem onClick={() => setFollowUp([{ kind: "entry", id: e.id }])}><ListChecks size={14} className="mr-2" /> Follow-up…</DropdownMenuItem>}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-card">
        <button type="button" onClick={() => setShowMatches((x) => !x)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="text-[13.5px] font-semibold text-slate-900">Matched, not yet reconciled ({w.matches.length})</span>
          <ChevronDown size={16} className={cn("text-slate-400 transition-transform", showMatches && "rotate-180")} />
        </button>
        {showMatches && (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {!w.matches.length && <p className="px-4 py-3 text-[12.5px] text-slate-500">Nothing yet.</p>}
            {w.matches.map((g: any) => (
              <div key={g.group} className="grid gap-2 px-4 py-2.5 text-[12.5px] md:grid-cols-[1fr_1fr_auto] md:items-center">
                <div>{g.lines.map((l: WorkItem) => <p key={l.id} className="flex justify-between gap-2"><span className="truncate">{showDay(l.date)} · {l.description}</span><Flow direction={l.direction} amount={l.amount} /></p>)}{!g.lines.length && <p className="text-slate-500">Cash book only (cancel each other out)</p>}</div>
                <div>{g.entries.map((e: WorkItem) => <p key={e.id} className="flex justify-between gap-2"><span className="truncate">{showDay(e.date)} · {e.source_number} {e.counterparty}</span><Flow direction={e.direction} amount={e.amount} /></p>)}{!g.entries.length && <p className="text-slate-500">Statement only (cancel each other out)</p>}</div>
                <div className="flex items-center gap-2 justify-self-end">
                  <Badge tone={g.method === "auto" ? "info" : g.method === "recorded" ? "violet" : "neutral"}>{g.method === "auto" ? "Automatic" : g.method === "recorded" ? "Recorded" : "By hand"}</Badge>
                  {canPrepare && <button type="button" disabled={busy} onClick={() => run(() => treasuryApi.unmatch(g.group), "Match undone")} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-red-50 hover:text-red-700"><Link2Off size={13} /> Undo</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {any && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-[13px]"><span className="text-slate-500">Statement</span> <span className="font-semibold tabular-nums">{rwfSigned(sumL)}</span> <span className="text-slate-400">({selLines.length})</span></p>
            <p className="text-[13px]"><span className="text-slate-500">Cash book</span> <span className="font-semibold tabular-nums">{rwfSigned(sumE)}</span> <span className="text-slate-400">({selEntries.length})</span></p>
            <p className={cn("text-[13px] font-medium", balanced ? "text-emerald-700" : "text-amber-700")}>{balanced ? <><CheckCircle2 size={14} className="mr-1 inline" />Totals agree</> : `Difference ${rwf(Math.abs(sumL - sumE))}`}</p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSel({ lines: new Set(), entries: new Set() })}><X size={14} /> Clear</Button>
              {canPrepare && <Button size="sm" variant="outline" onClick={() => setFollowUp([...selLines.map((l: WorkItem) => ({ kind: "line" as const, id: l.id })), ...selEntries.map((e: WorkItem) => ({ kind: "entry" as const, id: e.id }))])}><ListChecks size={14} /> Follow-up</Button>}
              {canPrepare && <Button size="sm" disabled={!balanced || busy} onClick={() => run(() => treasuryApi.match(w.account.id, [...sel.entries], [...sel.lines]), "Matched")}><Link2 size={14} /> Match</Button>}
            </div>
          </div>
        </div>
      )}

      {recordLine && <RecordLineDialog line={recordLine} onClose={() => setRecordLine(null)} onDone={() => { setRecordLine(null); refresh(); }} />}
      {followUp && <FollowUpDialog items={followUp} onClose={() => setFollowUp(null)} onDone={() => { setFollowUp(null); refresh(); }} />}
      {preparing && <PrepareDialog w={w} asOf={asOf} onClose={() => setPreparing(false)} onDone={onOpen} />}
      {importing && <StatementImport account={w.account} onClose={() => setImporting(false)} onDone={(r) => { setImporting(false); refresh(); toast.success(`${r.number}: ${r.lines} lines, ${r.matched} matched automatically`); }} />}
      <ReceiptDialog open={Boolean(receiptFrom)} prefill={receiptFrom || undefined} onClose={() => setReceiptFrom(null)} onSaved={() => { setReceiptFrom(null); refresh(); }} />
    </div>
  );
}

function Side({ title, empty, items, selected, onToggle, highlight, menu }: { title: string; empty: string; items: WorkItem[]; selected: Set<string>; onToggle: (id: string) => void; highlight: (x: WorkItem) => boolean; menu: (x: WorkItem) => React.ReactNode }) {
  const total = items.reduce((s, x) => s + signed(x.direction, x.amount), 0);
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-[13.5px] font-semibold text-slate-900">{title}</h3>
        <span className="whitespace-nowrap text-[12px] text-slate-500">{items.length} · net <span className="font-medium tabular-nums text-slate-700">{rwfSigned(total)}</span></span>
      </header>
      {!items.length ? <p className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-slate-500"><CheckCircle2 size={15} className="text-emerald-600" /> {empty}</p> : (
        <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto" role="listbox" aria-multiselectable>
          {items.map((x) => {
            const on = selected.has(x.id);
            const hint = highlight(x);
            return (
              <li key={x.id} role="option" aria-selected={on} className={cn("group flex items-start gap-3 px-3 py-2.5", on ? "bg-primary/[0.06]" : hint ? "bg-emerald-50/70" : "hover:bg-slate-50")}>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" checked={on} onChange={() => onToggle(x.id)} aria-label={`Select ${x.description}`} />
                <button type="button" onClick={() => onToggle(x.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-900">{x.kind === "entry" ? [x.counterparty, x.source_number].filter(Boolean).join(" · ") || x.description : x.description}</span>
                      <span className="block truncate text-[11.5px] text-slate-500">
                        {showDay(x.date)}{x.reference ? ` · ${x.reference}` : ""}{x.kind === "entry" && x.type ? ` · ${ENTRY_TYPES[x.type] || x.type}` : ""}{x.reversed ? " · reversed" : ""}
                      </span>
                    </span>
                    <Flow direction={x.direction} amount={x.amount} bold />
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {hint && <Badge tone="success">Same amount</Badge>}
                    {x.follow_up && <Badge tone={FOLLOW_UP[x.follow_up]?.tone}>{FOLLOW_UP[x.follow_up]?.label}</Badge>}
                    {x.follow_up_note && <span className="truncate text-[11.5px] text-slate-500">{x.follow_up_note}</span>}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Actions"><MoreHorizontal size={15} /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white">{menu(x)}</DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The reconciliation statement, live, at the chosen date. */
function RecSummary({ fig, asOf, setAsOf, min }: { fig: RecFigures; asOf: string; setAsOf: (d: string) => void; min?: string }) {
  const ok = fig.difference === 0;
  const row = (label: string, value: number, sign?: "+" | "−", strong?: boolean) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-[13px]", strong && "border-t border-slate-200 pt-1.5 font-semibold")}>
      <span className={strong ? "text-slate-900" : "text-slate-600"}>{sign && <span className="mr-1 inline-block w-3 text-slate-400">{sign}</span>}{label}</span>
      <span className="tabular-nums text-slate-900">{value.toLocaleString("en-US")}</span>
    </div>
  );
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-900">Reconciliation as of</h3>
        <input type="date" className="h-9 rounded-md border border-slate-200 px-2.5 text-[13px]" value={asOf} min={min ? String(min).slice(0, 10) : undefined} max={today()} onChange={(e) => e.target.value && setAsOf(e.target.value)} aria-label="Reconciliation date" />
      </div>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          {row("Balance on the bank statement", fig.statement_balance)}
          {row("Receipts not yet on the statement", fig.outstanding_receipts, "+")}
          {row("Payments not yet on the statement", fig.outstanding_payments, "−")}
          {row("Adjusted bank balance", fig.adjusted_bank_balance, undefined, true)}
        </div>
        <div>
          {row("Balance in the cash book", fig.book_balance)}
          {row("Bank credits not in the cash book", fig.unrecorded_receipts, "+")}
          {row("Bank debits not in the cash book", fig.unrecorded_payments, "−")}
          {row("Adjusted cash book balance", fig.adjusted_book_balance, undefined, true)}
        </div>
        <div className={cn("flex min-w-[170px] flex-col justify-center rounded-lg px-4 py-3 text-center", ok ? "bg-emerald-50" : "bg-red-50")}>
          <p className="text-[12px] text-slate-600">Difference</p>
          <p className={cn("text-[22px] font-semibold tabular-nums", ok ? "text-emerald-700" : "text-red-600")}>{fig.difference.toLocaleString("en-US")}</p>
          <p className={cn("text-[11.5px] font-medium", ok ? "text-emerald-700" : "text-red-600")}>{ok ? `Balanced · ${fig.items.length} reconciling item${fig.items.length === 1 ? "" : "s"}` : "Find the difference"}</p>
        </div>
      </div>
    </section>
  );
}

function RecordLineDialog({ line, onClose, onDone }: { line: WorkItem; onClose: () => void; onDone: () => void }) {
  const out = line.direction === "out";
  const [type, setType] = React.useState(out ? "bank_charge" : "interest");
  const [gl, setGl] = React.useState("");
  const [budgetLine, setBudgetLine] = React.useState("");
  const [description, setDescription] = React.useState(line.description);
  const [busy, setBusy] = React.useState(false);
  const ref = useQuery(["record-line-ref"], async () => ({
    gl: await pocketbase.collection("gl_accounts").getFullList({ filter: 'is_posting = true && active = true && cash_flow_class != "cash"', sort: "code", fields: "id,code,name,type" }),
    lines: await pocketbase.collection("budget_lines").getFullList({ filter: 'status = "active"', sort: "code", fields: "id,code,name,gl_account" }).catch(() => [] as any[]),
  }));
  React.useEffect(() => {
    if (!ref.data) return;
    const code = type === "bank_charge" ? "5212" : type === "interest" ? "4203" : "";
    const found = ref.data.gl.find((g: any) => g.code === code);
    setGl(found ? found.id : "");
  }, [type, ref.data]);
  const glOptions = (ref.data?.gl || []).filter((g: any) => (out ? g.type === "expense" || g.type === "liability" || g.type === "asset" : g.type === "revenue" || g.type === "liability" || g.type === "asset"));
  const lines = (ref.data?.lines || []).filter((l: any) => l.gl_account === gl);
  async function save() {
    setBusy(true);
    try {
      await treasuryApi.recordLine(line.id, { type, gl_account: gl, budget_line: out ? budgetLine : "", description: description.trim() });
      toast.success("Recorded in the cash book and matched");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Record in the cash book</DialogTitle>
          <DialogDescription>{showDay(line.date)} · {line.description} · {out ? "−" : "+"}{rwf(line.amount)}. The entry is matched to this line at once.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="What it is" htmlFor="rl-type">
            <select id="rl-type" className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {out ? <option value="bank_charge">Bank charge</option> : <option value="interest">Interest earned</option>}
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Account (chart of accounts)" required htmlFor="rl-gl">
            <select id="rl-gl" className={inputCls} value={gl} onChange={(e) => setGl(e.target.value)}>
              <option value="">Choose…</option>
              {glOptions.map((g: any) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
            </select>
          </Field>
          {out && (
            <Field label="Budget line" htmlFor="rl-bl" hint={lines.length ? "The charge is counted as spent on this line" : "No budget line uses this account"}>
              <select id="rl-bl" className={inputCls} value={budgetLine} disabled={!lines.length} onChange={(e) => setBudgetLine(e.target.value)}>
                <option value="">None</option>
                {lines.map((l: any) => <option key={l.id} value={l.id}>{l.code} {l.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Description" htmlFor="rl-desc"><textarea id="rl-desc" className={cn(textareaCls, "min-h-[60px]")} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!gl || busy} onClick={save}>{busy ? "Recording…" : "Record and match"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpDialog({ items, onClose, onDone }: { items: { kind: "entry" | "line"; id: string }[]; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = React.useState("timing");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const needsNote = status === "investigate" || status === "correct";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Follow-up for {items.length} item{items.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>Every item still open on the reconciliation date needs a follow-up before the reconciliation goes to the DAF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup">
          {Object.entries(FOLLOW_UP).map(([k, f]) => (
            <label key={k} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2", status === k ? "border-primary bg-primary/5" : "border-slate-200")}>
              <input type="radio" name="follow-up" className="mt-1" checked={status === k} onChange={() => setStatus(k)} />
              <span><span className="block text-[13px] font-medium text-slate-900">{f.label}</span><span className="block text-[12px] text-slate-500">{f.hint}</span></span>
            </label>
          ))}
          <Field label="Note" required={needsNote} htmlFor="fu-note"><textarea id="fu-note" className={cn(textareaCls, "min-h-[60px]")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "What is being checked or corrected, and by whom" : "Optional"} /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || (needsNote && note.trim().length < 5)} onClick={async () => {
            setBusy(true);
            try {
              const r = await treasuryApi.followUp(items, status, note.trim());
              toast.success(`${r.updated} item${r.updated === 1 ? "" : "s"} updated`);
              onDone();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrepareDialog({ w, asOf, onClose, onDone }: { w: any; asOf: string; onClose: () => void; onDone: (id: string) => void }) {
  const [date, setDate] = React.useState(asOf);
  const [balance, setBalance] = React.useState<number | "">("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const p = useQuery(["rec-preview", w.account.id, date], () => treasuryApi.preview(w.account.id, date), { enabled: Boolean(date) });
  React.useEffect(() => {
    if (p.data) setBalance(p.data.statement_balance_computed);
  }, [p.data]);
  async function create() {
    setBusy(true);
    try {
      const r = await pocketbase.collection("bank_reconciliations").create({ account: w.account.id, as_of: `${date} 12:00:00.000Z`, statement_balance: Number(balance) || 0, notes: notes.trim() });
      toast.success(`${r.number} prepared`);
      onDone(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Prepare the reconciliation · {w.account.code}</DialogTitle>
          <DialogDescription>Usually at the end of a month, on the date of the bank statement. You can still match items afterwards; the figures are refreshed until you send it to the DAF.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="As of" required htmlFor="pr-date"><input id="pr-date" type="date" className={inputCls} value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Balance printed on the statement" required htmlFor="pr-bal" hint={p.data ? `Imported lines give ${p.data.statement_balance_computed.toLocaleString("en-US")}` : undefined}><MoneyInput id="pr-bal" value={balance} onChange={setBalance} /></Field>
          <Field label="Notes" className="sm:col-span-2" htmlFor="pr-notes"><textarea id="pr-notes" className={cn(textareaCls, "min-h-[60px]")} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        {p.data?.warnings.map((t) => <p key={t} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{t}</p>)}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!date || balance === "" || busy} onClick={create}>{busy ? "Preparing…" : "Prepare"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ cash count
function CashCount({ w, asOf, setAsOf, canPrepare, onOpen }: { w: any; asOf: string; setAsOf: (d: string) => void; canPrepare: boolean; onOpen: (id: string) => void }) {
  const [counted, setCounted] = React.useState<number | "">("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const book = w.reconciliation.book_balance;
  const diff = counted === "" ? null : Number(counted) - book;
  async function create() {
    setBusy(true);
    try {
      const r = await pocketbase.collection("bank_reconciliations").create({ account: w.account.id, as_of: `${asOf} 12:00:00.000Z`, statement_balance: Number(counted), notes: notes.trim() });
      toast.success(`${r.number} prepared`);
      onOpen(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <Header w={w} actions={w.open_reconciliation && <Button size="sm" onClick={() => onOpen(w.open_reconciliation.id)}><Scale size={14} /> Open {w.open_reconciliation.number}</Button>} />
      <section className="max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Counted on" required htmlFor="cc-date"><input id="cc-date" type="date" className={inputCls} value={asOf} max={today()} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></Field>
          <Field label="Cash book balance on that day"><p className="flex h-10 items-center text-[18px] font-semibold tabular-nums text-slate-900">{rwf(book)}</p></Field>
          <Field label="Cash counted in the safe" required htmlFor="cc-count" hint="Count notes and coins with the custodian present"><MoneyInput id="cc-count" value={counted} onChange={setCounted} /></Field>
          <Field label="Difference">
            <p className={cn("flex h-10 items-center text-[18px] font-semibold tabular-nums", diff === null ? "text-slate-400" : diff === 0 ? "text-emerald-700" : "text-red-600")}>{diff === null ? "—" : diff === 0 ? "None — agrees" : `${diff > 0 ? "Surplus" : "Shortage"} ${rwf(Math.abs(diff))}`}</p>
          </Field>
          <Field label="Notes" className="sm:col-span-2" htmlFor="cc-notes"><textarea id="cc-notes" className={cn(textareaCls, "min-h-[60px]")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who counted, who was present" /></Field>
        </div>
        {diff !== null && diff !== 0 && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">A cash count is approved only when it agrees with the cash book. Record the shortage (payment voucher) or the surplus (receipt) first, then count again.</p>}
        {canPrepare && !w.open_reconciliation && (
          <div className="mt-4 flex justify-end">
            <Button disabled={counted === "" || !asOf || busy} onClick={create}><Scale size={14} /> {busy ? "Preparing…" : "Prepare cash count"}</Button>
          </div>
        )}
        <p className="mt-3 text-[12px] text-slate-500">{w.account.reconciled_to ? `Last count approved for ${showDay(w.account.reconciled_to)}.` : "No cash count approved yet."} <Link to={`/dashboard/treasury/accounts/${w.account.id}`} className="text-primaryDark hover:underline">See the cash book</Link></p>
      </section>
    </div>
  );
}
