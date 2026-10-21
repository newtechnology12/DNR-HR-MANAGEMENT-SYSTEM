/**
 * Small pieces shared by the bank and cash screens: a money input with thousands separators, the account
 * picker (with the live balance), money in / out amounts and the reconciliation status of an account.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Landmark, Wallet } from "lucide-react";
import { activeAccounts } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";
import { ConfirmDialog } from "@/components/ims";

/** Whole-RWF amount input: digits only, shown with thousands separators. */
export function MoneyInput({ value, onChange, id, invalid, placeholder = "0", className, disabled }: {
  value: number | "";
  onChange: (v: number | "") => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const shown = value === "" ? "" : Number(value).toLocaleString("en-US");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-ims-faint">RWF</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(inputCls, "pl-12 text-right font-medium tabular-nums", className)}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
          onChange(digits === "" ? "" : Math.min(Number(digits), 999999999999));
        }}
      />
    </div>
  );
}

export function KindIcon({ kind, className }: { kind?: string; className?: string }) {
  const Icon = kind === "cash" ? Wallet : Landmark;
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", kind === "cash" ? "bg-amber-50 text-amber-700" : "bg-ralga-navy/[0.08] text-ralga-navy", className)}>
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
    <select
      id={id}
      aria-invalid={invalid || undefined}
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value, rows.find((a: any) => a.id === e.target.value))}
    >
      <option value="">{q.isLoading ? "Loading…" : placeholder}</option>
      {rows.map((a: any) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name} — {rwf(a.book_balance)}{a.funding_source ? " · restricted" : ""}
        </option>
      ))}
    </select>
  );
}

/** Money in (+) or out (−) with an arrow; the colour only supports the sign, which is always printed. */
export function Flow({ direction, amount, className, bold }: { direction: string; amount: number; className?: string; bold?: boolean }) {
  const inn = direction === "in";
  return (
    <span className={cn("inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums", bold && "font-semibold", inn ? "text-emerald-700" : "text-ims-text", className)}>
      {inn ? <ArrowDownLeft size={13} aria-hidden /> : <ArrowUpRight size={13} className="text-ims-faint" aria-hidden />}
      {inn ? "+" : "−"}{Math.round(amount).toLocaleString("en-US")}
    </span>
  );
}

/** "Reconciled to 30 Sep" (green), "due" (amber) or "never reconciled". */
export function ReconState({ reconciledTo, due, kind }: { reconciledTo?: string; due?: string; kind?: string }) {
  const late = Boolean(due && (!reconciledTo || reconciledTo < due));
  if (reconciledTo && !late) {
    return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700"><CheckCircle2 size={13} aria-hidden /> {kind === "cash" ? "Counted" : "Reconciled"} to {showDay(reconciledTo)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700">
      <Clock3 size={13} aria-hidden /> {reconciledTo ? `Due ${showDay(due)} · last ${showDay(reconciledTo)}` : kind === "cash" ? "No cash count yet" : "Not reconciled yet"}
    </span>
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

/** One key figure (KPI-band style). */
export function Stat({ label, value, sub, tone = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "warning" | "success" }) {
  return (
    <div className="min-w-0 rounded-card border border-ims-border bg-ims-card px-5 py-4">
      <p className="truncate text-t-small text-ims-muted">{label}</p>
      <p className={cn("mt-1 break-words text-t-kpi tabular-nums", tone === "warning" ? "text-ims-warning" : tone === "success" ? "text-ims-success" : "text-ims-text")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-t-small text-ims-muted">{sub}</p>}
    </div>
  );
}
