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
import { CheckCircle2, ChevronDown, FileSpreadsheet, Link2, Link2Off, ListChecks, LucideIcon, MoreHorizontal, Receipt, Scale, Sparkles, Wallet, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { ENTRY_TYPES, FOLLOW_UP, RecFigures, WorkItem, signed, treasuryApi } from "@/lib/treasury";
import { rwfSigned } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Button,
  Card,
  CardHeader,
  DatePicker,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  FilterSelect,
  HeaderAction,
  Modal,
  Page,
  PageHeader,
  Pill,
  PillTone,
  Select,
  Textarea,
  checkboxClass,
  fmtDate,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { Flow, MoneyInput, lastMonthEnd } from "@/components/treasury/TreasuryKit";
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
  if (q.isLoading || !w) {
    return (
      <Page>
        {q.isError ? (
          <Card>
            <ErrorState text="The reconciliation screen could not be loaded." detail={(q.error as any)?.message || ""} onRetry={() => q.refetch()} />
          </Card>
        ) : (
          <>
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-10 w-96 max-w-full" />
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-80 w-full rounded-card" />
          </>
        )}
      </Page>
    );
  }
  const refresh = () => q.refetch();
  const prepare = can("prepare_bank_reconciliation");
  return w.account.kind === "cash"
    ? <CashCount w={w} asOf={asOf} setAsOf={setAsOf} canPrepare={prepare} onOpen={(id) => navigate(`/dashboard/treasury/reconciliations/${id}`)} />
    : <BankWorkspace w={w} asOf={asOf} setAsOf={setAsOf} canPrepare={prepare} canRecordReceipt={can("manage_treasury")} refresh={refresh} onOpen={(id) => navigate(`/dashboard/treasury/reconciliations/${id}`)} />;
}

function Header({ w, primary, secondary }: { w: any; primary?: HeaderAction; secondary?: HeaderAction[] }) {
  const a = w.account;
  const cash = a.kind === "cash";
  return (
    <PageHeader
      breadcrumbs={[
        { label: "Bank & cash", to: "/dashboard/treasury" },
        { label: "Accounts", to: "/dashboard/treasury/accounts" },
        { label: a.code, to: `/dashboard/treasury/accounts/${a.id}` },
        { label: cash ? "Cash count" : "Reconcile" },
      ]}
      title={`${cash ? "Cash count" : "Reconcile"} ${a.code}`}
      subtitle={
        cash
          ? `${a.name}: count the cash with the custodian (${a.custodian_name || "—"}) and compare it with the cash book.`
          : `${a.name} · ${a.bank_name} · ${a.account_number}. ${a.reconciled_to ? `Reconciled up to ${fmtDate(a.reconciled_to)}.` : "Not reconciled yet."}`
      }
      primary={primary}
      secondary={secondary}
    />
  );
}

type ItemAction = { label: string; icon: LucideIcon; onSelect: () => void };

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
  const autoMatch = () => run(async () => { const r = await treasuryApi.autoMatch(w.account.id); if (!r.matched) throw new Error(r.ambiguous ? `Nothing matched automatically: ${r.ambiguous} line(s) have several possible entries — match them by hand.` : "Nothing more to match automatically."); }, "Matched automatically");
  const filtersOn = Boolean(search.trim() || dir);

  return (
    <Page>
      <Header
        w={w}
        primary={w.open_reconciliation ? { label: `Open ${w.open_reconciliation.number}`, icon: Scale, onClick: () => onOpen(w.open_reconciliation.id) } : canPrepare ? { label: "Prepare reconciliation", icon: Scale, onClick: () => setPreparing(true) } : undefined}
        secondary={canPrepare ? [{ label: "Import statement", icon: FileSpreadsheet, onClick: () => setImporting(true) }, { label: "Match automatically", icon: Sparkles, disabled: busy, onClick: autoMatch }] : []}
      />

      <RecSummary fig={fig} asOf={asOf} setAsOf={setAsOf} min={w.account.reconciled_to ? w.account.reconciled_to : w.account.opening_date} />
      {fig.warnings.map((t: string) => (
        <p key={t} className="rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">{t}</p>
      ))}

      <Card padded={false}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search text, reference or amount" }}
          chips={[
            ...(dir ? [{ key: "dir", label: dir === "in" ? "Money in" : "Money out", onRemove: () => setDir("") }] : []),
          ]}
          onClear={() => { setSearch(""); setDir(""); }}
          right={<span className="max-w-[420px] text-t-small text-ims-muted">Automatic matching: same amount and direction within {w.match_days} days, the reference first.</span>}
        >
          <FilterSelect label="Direction" value={dir} onChange={(v) => setDir(v as "" | "in" | "out")} options={[{ value: "in", label: "Money in" }, { value: "out", label: "Money out" }]} />
        </FilterBar>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Side
          title="On the bank statement, not in the cash book yet"
          empty={filtersOn ? "No statement line matches the search." : statementsBehind ? "Import the bank statement to see its lines here." : "Every statement line is matched."}
          done={!filtersOn && !statementsBehind}
          items={order(w.lines, "lines")}
          selected={sel.lines}
          onToggle={(id) => toggle("lines", id)}
          highlight={same}
          menu={(l) => [
            ...(canPrepare ? [{ label: l.direction === "out" ? "Record as bank charge" : "Record as interest or other", icon: Receipt, onSelect: () => setRecordLine(l) }] : []),
            ...(canRecordReceipt && l.direction === "in" ? [{ label: "Record as a receipt", icon: Wallet, onSelect: () => setReceiptFrom({ account: w.account.id, receipt_date: l.date, amount: l.amount, reference: l.reference, description: l.description, statement_line: l.id }) }] : []),
            ...(canPrepare ? [{ label: "Follow-up…", icon: ListChecks, onSelect: () => setFollowUp([{ kind: "line", id: l.id }]) }] : []),
          ]}
        />
        <Side
          title="In the cash book, not on the statement yet"
          empty={filtersOn ? "No cash book entry matches the search." : "Every cash book entry is matched."}
          done={!filtersOn}
          items={order(w.entries, "entries")}
          selected={sel.entries}
          onToggle={(id) => toggle("entries", id)}
          highlight={same}
          menu={(e) => (canPrepare ? [{ label: "Follow-up…", icon: ListChecks, onSelect: () => setFollowUp([{ kind: "entry", id: e.id }]) }] : [])}
        />
      </div>

      <Card padded={false}>
        <button type="button" onClick={() => setShowMatches((x) => !x)} aria-expanded={showMatches} className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-card px-5 py-3 text-left hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus">
          <span className="text-t-body font-bold text-ims-text">Matched, not yet reconciled <span className="font-semibold text-ims-faint tabular-nums">({w.matches.length})</span></span>
          <ChevronDown size={16} className={cn("shrink-0 text-ims-muted transition-transform", showMatches && "rotate-180")} aria-hidden />
        </button>
        {showMatches && (
          <div className="divide-y divide-ims-divider border-t border-ims-divider">
            {!w.matches.length && <p className="px-5 py-4 text-t-small text-ims-muted">Nothing matched since the last reconciliation.</p>}
            {w.matches.map((g: any) => (
              <div key={g.group} className="grid gap-2 px-5 py-3 text-t-small md:grid-cols-[1fr_1fr_auto] md:items-center">
                <div className="min-w-0">
                  {g.lines.map((l: WorkItem) => <p key={l.id} className="flex justify-between gap-2"><span className="truncate text-ims-body">{fmtDate(l.date)} · {l.description}</span><Flow direction={l.direction} amount={l.amount} /></p>)}
                  {!g.lines.length && <p className="text-ims-muted">Cash book only (they cancel each other out)</p>}
                </div>
                <div className="min-w-0">
                  {g.entries.map((e: WorkItem) => <p key={e.id} className="flex justify-between gap-2"><span className="truncate text-ims-body">{fmtDate(e.date)} · {e.source_number} {e.counterparty}</span><Flow direction={e.direction} amount={e.amount} /></p>)}
                  {!g.entries.length && <p className="text-ims-muted">Statement only (they cancel each other out)</p>}
                </div>
                <div className="flex items-center gap-2 justify-self-end">
                  <Pill tone={g.method === "auto" ? "info" : g.method === "recorded" ? "orange" : "neutral"}>{g.method === "auto" ? "Automatic" : g.method === "recorded" ? "Recorded" : "By hand"}</Pill>
                  {canPrepare && <Button variant="ghost" size="sm" icon={Link2Off} disabled={busy} onClick={() => run(() => treasuryApi.unmatch(g.group), "Match undone")}>Undo</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {any && (
        <div className="sticky bottom-3 z-30 rounded-card border border-ims-border bg-ims-card/95 px-4 py-3 shadow-menu backdrop-blur sm:px-5" role="region" aria-label="Selected items">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-t-body"><span className="text-ims-muted">Statement</span> <span className="font-bold tabular-nums text-ims-text">{rwfSigned(sumL)}</span> <span className="text-ims-faint">({selLines.length})</span></p>
            <p className="text-t-body"><span className="text-ims-muted">Cash book</span> <span className="font-bold tabular-nums text-ims-text">{rwfSigned(sumE)}</span> <span className="text-ims-faint">({selEntries.length})</span></p>
            <p className={cn("inline-flex items-center gap-1 text-t-body font-semibold", balanced ? "text-ims-success" : "text-ims-warning")}>
              {balanced ? <><CheckCircle2 size={15} aria-hidden /> Totals agree</> : `Difference ${fmtMoney(Math.abs(sumL - sumE))}`}
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="ghost" icon={X} onClick={() => setSel({ lines: new Set(), entries: new Set() })}>Clear</Button>
              {canPrepare && <Button icon={ListChecks} onClick={() => setFollowUp([...selLines.map((l: WorkItem) => ({ kind: "line" as const, id: l.id })), ...selEntries.map((e: WorkItem) => ({ kind: "entry" as const, id: e.id }))])}>Follow-up</Button>}
              {canPrepare && <Button variant="primary" icon={Link2} disabled={!balanced || busy} onClick={() => run(() => treasuryApi.match(w.account.id, [...sel.entries], [...sel.lines]), "Matched")}>Match</Button>}
            </div>
          </div>
        </div>
      )}

      {recordLine && <RecordLineDialog line={recordLine} onClose={() => setRecordLine(null)} onDone={() => { setRecordLine(null); refresh(); }} />}
      {followUp && <FollowUpDialog items={followUp} onClose={() => setFollowUp(null)} onDone={() => { setFollowUp(null); refresh(); }} />}
      {preparing && <PrepareDialog w={w} asOf={asOf} onClose={() => setPreparing(false)} onDone={onOpen} />}
      {importing && <StatementImport account={w.account} onClose={() => setImporting(false)} onDone={(r) => { setImporting(false); refresh(); toast.success(`${r.number}: ${r.lines} lines, ${r.matched} matched automatically`); }} />}
      <ReceiptDialog open={Boolean(receiptFrom)} prefill={receiptFrom || undefined} onClose={() => setReceiptFrom(null)} onSaved={() => { setReceiptFrom(null); refresh(); }} />
    </Page>
  );
}

function Side({ title, empty, done, items, selected, onToggle, highlight, menu }: { title: string; empty: string; done: boolean; items: WorkItem[]; selected: Set<string>; onToggle: (id: string) => void; highlight: (x: WorkItem) => boolean; menu: (x: WorkItem) => ItemAction[] }) {
  const total = items.reduce((s, x) => s + signed(x.direction, x.amount), 0);
  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ims-divider px-5 py-3.5">
        <h2 className="text-t-body font-bold text-ims-text">{title}</h2>
        <span className="whitespace-nowrap text-t-small text-ims-muted">{fmtNumber(items.length)} · net <span className="font-semibold tabular-nums text-ims-text">{rwfSigned(total)}</span></span>
      </header>
      {!items.length ? (
        done ? (
          <p className="flex items-center gap-2 px-5 py-6 text-t-small text-ims-muted"><CheckCircle2 size={15} className="shrink-0 text-ims-success" aria-hidden /> {empty}</p>
        ) : (
          <EmptyState compact text={empty} />
        )
      ) : (
        <ul className="max-h-[560px] divide-y divide-ims-divider overflow-y-auto" aria-label={title}>
          {items.map((x) => {
            const on = selected.has(x.id);
            const hint = highlight(x);
            const actions = menu(x);
            const name = x.kind === "entry" ? [x.counterparty, x.source_number].filter(Boolean).join(" · ") || x.description : x.description;
            return (
              <li key={x.id} className={cn("flex items-start gap-3 px-4 py-2.5", on ? "bg-ims-info-bg" : hint ? "bg-ims-success-bg/60" : "hover:bg-ims-hover")}>
                <input type="checkbox" className={cn(checkboxClass, "mt-1")} checked={on} onChange={() => onToggle(x.id)} aria-label={`Select ${name}, ${x.direction === "in" ? "+" : "−"}${fmtNumber(x.amount)}`} />
                <button type="button" onClick={() => onToggle(x.id)} className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus" tabIndex={-1}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-t-body font-semibold text-ims-text">{name}</span>
                      <span className="block truncate text-t-small text-ims-muted">
                        {fmtDate(x.date)}{x.reference ? ` · ${x.reference}` : ""}{x.kind === "entry" && x.type ? ` · ${ENTRY_TYPES[x.type] || x.type}` : ""}{x.reversed ? " · reversed" : ""}
                      </span>
                    </span>
                    <Flow direction={x.direction} amount={x.amount} bold />
                  </span>
                  {(hint || x.follow_up || x.follow_up_note) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {hint && <Pill tone="success">Same amount</Pill>}
                      {x.follow_up && <Pill tone={(FOLLOW_UP[x.follow_up]?.tone as PillTone) || "neutral"} title={FOLLOW_UP[x.follow_up]?.hint}>{FOLLOW_UP[x.follow_up]?.label || x.follow_up}</Pill>}
                      {x.follow_up_note && <span className="truncate text-t-small text-ims-muted">{x.follow_up_note}</span>}
                    </span>
                  )}
                </button>
                {actions.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={`Actions for ${name}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ims-muted hover:bg-ims-subtle hover:text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus">
                        <MoreHorizontal size={17} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px] rounded-control border-ims-border p-1 shadow-menu">
                      {actions.map((a) => (
                        <DropdownMenuItem key={a.label} onSelect={a.onSelect} className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-md px-2.5 text-t-body text-ims-text focus:bg-ims-subtle">
                          <a.icon size={16} className="shrink-0" aria-hidden /> {a.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The reconciliation statement, live, at the chosen date. */
function RecSummary({ fig, asOf, setAsOf, min }: { fig: RecFigures; asOf: string; setAsOf: (d: string) => void; min?: string }) {
  const ok = fig.difference === 0;
  const row = (label: string, value: number, sign?: "+" | "−", strong?: boolean) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-t-body", strong && "border-t border-ims-border pt-1.5 font-bold")}>
      <span className={strong ? "text-ims-text" : "text-ims-body"}>{sign && <span className="mr-1 inline-block w-3 text-ims-faint">{sign}</span>}{label}</span>
      <span className="tabular-nums text-ims-text">{fmtNumber(value)}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader
        title="Reconciliation as of"
        subtitle="Figures in RWF, recalculated for the chosen date."
        action={
          <DatePicker
            id="rec-as-of"
            value={asOf}
            min={min ? String(min).slice(0, 10) : undefined}
            max={today()}
            onChange={(v) => v && setAsOf(v)}
            className="h-button w-[170px] text-t-body"
          />
        }
      />
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-[1fr_1fr_auto]">
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
        <div className={cn("flex min-w-[180px] flex-col justify-center rounded-control px-4 py-3 text-center", ok ? "bg-ims-success-bg" : "bg-ims-danger-bg")}>
          <p className="text-t-small text-ims-body">Difference</p>
          <p className={cn("text-t-kpi tabular-nums", ok ? "text-ims-success" : "text-ims-danger")}>{fmtNumber(fig.difference)}</p>
          <p className={cn("text-t-small font-semibold", ok ? "text-ims-success" : "text-ims-danger")}>{ok ? `Balanced · ${fig.items.length} reconciling item${fig.items.length === 1 ? "" : "s"}` : "Find the difference"}</p>
        </div>
      </div>
    </Card>
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
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Record in the cash book"
      description={`${fmtDate(line.date)} · ${line.description} · ${out ? "−" : "+"}${fmtMoney(line.amount)}. The entry is matched to this line at once.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" disabled={!gl} loading={busy} onClick={save}>Record and match</Button>
        </>
      }
    >
      <Field label="What it is" htmlFor="rl-type">
        <Select id="rl-type" value={type} onChange={(e) => setType(e.target.value)}>
          {out ? <option value="bank_charge">Bank charge</option> : <option value="interest">Interest earned</option>}
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Account (chart of accounts)" required htmlFor="rl-gl" hint="Bank charges go to 5212 and interest to 4203 unless you choose another account.">
        <Select id="rl-gl" value={gl} onChange={(e) => setGl(e.target.value)}>
          <option value="">Choose an account</option>
          {glOptions.map((g: any) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
        </Select>
      </Field>
      {out && (
        <Field label="Budget line" htmlFor="rl-bl" hint={lines.length ? "The charge is counted as spent on this line" : "No budget line uses this account"}>
          <Select id="rl-bl" value={budgetLine} disabled={!lines.length} onChange={(e) => setBudgetLine(e.target.value)}>
            <option value="">None</option>
            {lines.map((l: any) => <option key={l.id} value={l.id}>{l.code} {l.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Description" htmlFor="rl-desc">
        <Textarea id="rl-desc" className="min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </Modal>
  );
}

function FollowUpDialog({ items, onClose, onDone }: { items: { kind: "entry" | "line"; id: string }[]; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = React.useState("timing");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const needsNote = status === "investigate" || status === "correct";
  async function save() {
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
  }
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Follow-up for ${items.length} item${items.length === 1 ? "" : "s"}`}
      description="Every item still open on the reconciliation date needs a follow-up before the reconciliation goes to the DAF."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={needsNote && note.trim().length < 5} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label="Follow-up">
        {Object.entries(FOLLOW_UP).map(([k, f]) => (
          <label key={k} className={cn("flex cursor-pointer items-start gap-2.5 rounded-control border px-3.5 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ims-focus", status === k ? "border-ims-link bg-ims-info-bg" : "border-ims-field hover:bg-ims-hover")}>
            <input type="radio" name="follow-up" className="mt-1 accent-ims-primary" checked={status === k} onChange={() => setStatus(k)} />
            <span>
              <span className="block text-t-body font-semibold text-ims-text">{f.label}</span>
              <span className="block text-t-small text-ims-muted">{f.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Note" required={needsNote} htmlFor="fu-note" hint={needsNote ? "Say what is being checked or corrected, and by whom (at least 5 characters)." : undefined}>
        <Textarea id="fu-note" className="min-h-[72px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "What is being checked or corrected, and by whom" : "Optional"} />
      </Field>
    </Modal>
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
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={<>Prepare the reconciliation of <span className="whitespace-nowrap">{w.account.code}</span></>}
      description="Usually at the end of a month, on the date of the bank statement. You can still match items afterwards; the figures are refreshed until you submit it to the DAF."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" disabled={!date || balance === ""} loading={busy} onClick={create}>Prepare</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="As of" required htmlFor="pr-date">
          <DatePicker id="pr-date" value={date} max={today()} onChange={setDate} />
        </Field>
        <Field label="Balance printed on the statement" required htmlFor="pr-bal" hint={p.data ? `Imported lines give ${fmtNumber(p.data.statement_balance_computed)}` : undefined}>
          <MoneyInput id="pr-bal" value={balance} onChange={setBalance} />
        </Field>
        <Field label="Notes" className="sm:col-span-2" htmlFor="pr-notes">
          <Textarea id="pr-notes" className="min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {p.data?.warnings.map((t) => (
        <p key={t} className="rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3.5 py-2.5 text-t-small text-ims-warning">{t}</p>
      ))}
    </Modal>
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
    <Page>
      <Header w={w} primary={w.open_reconciliation ? { label: `Open ${w.open_reconciliation.number}`, icon: Scale, onClick: () => onOpen(w.open_reconciliation.id) } : undefined} />
      <Card className="max-w-2xl">
        <CardHeader title="Count the cash" subtitle="Count notes and coins with the custodian present, then prepare the count for the DAF." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Counted on" required htmlFor="cc-date">
            <DatePicker id="cc-date" value={asOf} max={today()} onChange={(v) => v && setAsOf(v)} />
          </Field>
          <div className="min-w-0">
            <p className="mb-1.5 text-t-label text-ims-text">Cash book balance on that day</p>
            <p className="flex h-control items-center text-t-section tabular-nums text-ims-text">{fmtMoney(book)}</p>
          </div>
          <Field label="Cash counted in the safe" required htmlFor="cc-count" hint="Count notes and coins with the custodian present">
            <MoneyInput id="cc-count" value={counted} onChange={setCounted} />
          </Field>
          <div className="min-w-0">
            <p className="mb-1.5 text-t-label text-ims-text">Difference</p>
            <p className={cn("flex h-control items-center text-t-section tabular-nums", diff === null ? "text-ims-faint" : diff === 0 ? "text-ims-success" : "text-ims-danger")} aria-live="polite">
              {diff === null ? "—" : diff === 0 ? "None: it agrees" : `${diff > 0 ? "Surplus" : "Shortage"} ${fmtMoney(Math.abs(diff))}`}
            </p>
          </div>
          <Field label="Notes" className="sm:col-span-2" htmlFor="cc-notes">
            <Textarea id="cc-notes" className="min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who counted, who was present" />
          </Field>
        </div>
        {diff !== null && diff !== 0 && (
          <p className="mt-4 rounded-control border border-ims-danger/30 bg-ims-danger-bg px-3.5 py-2.5 text-t-small text-ims-danger">
            A cash count is approved only when it agrees with the cash book. Record the shortage (payment voucher) or the surplus (receipt) first, then count again.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ims-divider pt-4">
          <p className="text-t-small text-ims-muted">
            {w.account.reconciled_to ? `Last count approved for ${fmtDate(w.account.reconciled_to)}.` : "No cash count approved yet."}{" "}
            <Link to={`/dashboard/treasury/accounts/${w.account.id}`} className="font-semibold text-ims-link hover:underline">See the cash book</Link>
          </p>
          {canPrepare && !w.open_reconciliation && (
            <Button variant="primary" icon={Scale} disabled={counted === "" || !asOf} loading={busy} onClick={create}>Prepare cash count</Button>
          )}
        </div>
      </Card>
    </Page>
  );
}
