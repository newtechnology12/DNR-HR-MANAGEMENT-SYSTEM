/**
 * Small pieces shared by the bank and cash screens, built on the ims kit: a money input capped at the
 * largest amount the server accepts, the account picker (with the live balance), money in / out amounts,
 * the reconciliation state of an account, the reason dialog and a single key figure.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Landmark, Wallet } from "lucide-react";
import { activeAccounts } from "@/lib/treasury";
import { cn } from "@/utils";
import { ConfirmDialog, MoneyInput as ImsMoneyInput, Select, fmtDate, fmtMoney, fmtMoneyShort, fmtNumber } from "@/components/ims";

const MAX_AMOUNT = 999999999999;

/** Whole-RWF amount input: "RWF" before the number, thousands separators while typing (the ims MoneyInput). */
export function MoneyInput({ value, onChange, id, invalid, placeholder = "0", className, disabled }: {
  value: number | "";
  onChange: (v: number | "") => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <ImsMoneyInput
      id={id}
      value={value}
      invalid={invalid}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onChange={(v) => onChange(v === "" ? "" : Math.min(Number(v), MAX_AMOUNT))}
    />
  );
}

/** Bank (landmark) or cash book (wallet) mark, for pickers and lists of accounts. */
export function KindIcon({ kind, className }: { kind?: string; className?: string }) {
  const Icon = kind === "cash" ? Wallet : Landmark;
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-control", kind === "cash" ? "bg-ims-warning-bg text-ims-warning" : "bg-ims-info-bg text-ims-primary", className)} aria-hidden>
      <Icon size={15} />
    </span>
  );
}

/** Active accounts as a select; `kind` limits to bank accounts or cash books. Shows the cash book balance. */
export function AccountSelect({ value, onChange, kind, exclude, id, invalid, placeholder = "Choose an account" }: {
  value: string;
  onChange: (id: string, account?: any) => void;
  kind?: "bank" | "cash";
  exclude?: string;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const q = useQuery(["treasury-accounts", kind || "all"], () => activeAccounts(kind), { staleTime: 30000 });
  const rows = (q.data || []).filter((a: any) => a.id !== exclude);
  return (
    <Select id={id} invalid={invalid} value={value} onChange={(e) => onChange(e.target.value, rows.find((a: any) => a.id === e.target.value))}>
      <option value="">{q.isLoading ? "Loading accounts…" : placeholder}</option>
      {rows.map((a: any) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name} — {fmtMoney(a.book_balance)}{a.funding_source ? " · restricted" : ""}
        </option>
      ))}
    </Select>
  );
}

/** Money in (+) or out (−) with an arrow; the colour only supports the sign, which is always printed. */
export function Flow({ direction, amount, className, bold }: { direction: string; amount: number; className?: string; bold?: boolean }) {
  const inn = direction === "in";
  return (
    <span className={cn("inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums", bold && "font-semibold", inn ? "text-ims-success" : "text-ims-text", className)}>
      {inn ? <ArrowDownLeft size={13} aria-hidden /> : <ArrowUpRight size={13} className="text-ims-faint" aria-hidden />}
      {inn ? "+" : "−"}{fmtNumber(Math.round(amount))}
    </span>
  );
}

/** "Reconciled to 30 Sep 2026" (green), "Due 30 Sep 2026 · last 31 Aug 2026" (amber) or "Not reconciled yet". */
export function ReconState({ reconciledTo, due, kind }: { reconciledTo?: string; due?: string; kind?: string }) {
  const late = Boolean(due && (!reconciledTo || reconciledTo < due));
  if (reconciledTo && !late) {
    return (
      <span className="inline-flex items-start gap-1 text-t-small font-semibold text-ims-success">
        <CheckCircle2 size={13} className="mt-[2.5px] shrink-0" aria-hidden /> {kind === "cash" ? "Counted" : "Reconciled"} to {fmtDate(reconciledTo)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1 text-t-small font-semibold text-ims-warning">
      <Clock3 size={13} className="mt-[2.5px] shrink-0" aria-hidden /> {reconciledTo ? `Due ${fmtDate(due)} · last ${fmtDate(reconciledTo)}` : kind === "cash" ? "No cash count yet" : "Not reconciled yet"}
    </span>
  );
}

/** "12/15" with a thin progress bar. */
export function MatchBar({ matched, total }: { matched: number; total: number }) {
  const pct = total ? Math.round((matched / total) * 100) : 0;
  return (
    <span className="flex min-w-[130px] items-center gap-2" title={`${pct}% matched`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-pill bg-ims-subtle" aria-hidden>
        <span className="block h-full rounded-pill bg-ims-link" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-t-small tabular-nums text-ims-body">{fmtNumber(matched)}/{fmtNumber(total)}</span>
    </span>
  );
}

/** "1 Oct – 16 Oct 2026" (the year once when both dates share it). */
export const periodText = (from?: string, to?: string) => {
  const a = fmtDate(from);
  const b = fmtDate(to);
  const sameYear = /\d{4}$/.test(a) && a.slice(-4) === b.slice(-4);
  return sameYear ? `${a.slice(0, -5)} – ${b}` : `${a} – ${b}`;
};

/** Money in a KpiBand: the exact amount on wider screens, "RWF 1.3B" on phones where the exact one would break mid-number. */
export function KpiMoney({ value }: { value?: number | null }) {
  return (
    <>
      <span className="whitespace-nowrap sm:hidden">{fmtMoneyShort(value)}</span>
      <span className="hidden whitespace-nowrap sm:inline">{fmtMoney(value)}</span>
    </>
  );
}

/** Last day of the previous month: the date every account should be reconciled to. */
export function lastMonthEnd(today = new Date()) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

/** Confirmation with a mandatory reason (cancel, reverse): the ims ConfirmDialog. */
export function ReasonDialog({ open, title, description, confirmLabel, min = 3, danger = true, onConfirm, onClose }: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  min?: number;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      danger={danger}
      reason={{ label: "Reason", min, required: true }}
      onConfirm={onConfirm}
    />
  );
}

/** One key figure in its own card. Pages with several figures use the ims KpiBand instead. */
export function Stat({ label, value, sub, tone = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "warning" | "success" }) {
  return (
    <div className="min-w-0 rounded-card border border-ims-border bg-ims-card px-5 py-4">
      <p className="truncate text-t-small text-ims-muted">{label}</p>
      <p className={cn("mt-1 break-words text-t-kpi tabular-nums", tone === "warning" ? "text-ims-warning" : tone === "success" ? "text-ims-success" : "text-ims-text")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-t-small text-ims-muted">{sub}</p>}
    </div>
  );
}
