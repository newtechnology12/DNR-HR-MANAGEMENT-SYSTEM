/**
 * Forms: label above the field (13px/700, red * when required), hint under it (12px muted), and on
 * error a red border plus a message that says how to fix it. Inputs are 42px high, radius 9px.
 * Long forms use numbered sections ("1 · Details"), an error summary after submit, a summary panel
 * with a live checklist on desktop, and FormActions ("Submit for approval" · "Save draft" · Cancel).
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertCircle, CalendarDays, Check, ChevronDown, Circle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/utils";
import { Button } from "./Button";
import { toDate } from "./format";

// ------------------------------------------------------------------ fields
export const inputClass =
  "block h-control w-full rounded-control border border-ims-field bg-ims-card px-3 text-[14px] text-ims-text placeholder:text-ims-faint transition-shadow focus:border-ims-focus focus:outline-none focus:ring-2 focus:ring-ims-focus/25 disabled:cursor-not-allowed disabled:bg-ims-subtle disabled:text-ims-muted aria-[invalid=true]:border-ims-danger aria-[invalid=true]:focus:ring-ims-danger/20";
export const textareaClass = cn(inputClass, "h-auto min-h-[104px] py-2.5 leading-relaxed");
export const selectClass = cn(inputClass, "appearance-none pr-9");

export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  /** Say how to fix it: "Enter an amount above 0". */
  error?: string | false | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-t-label text-ims-text">
        {label}
        {required && <span className="ml-0.5 text-ims-danger" aria-hidden>*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="mt-1.5 flex items-start gap-1 text-t-hint text-ims-danger" role="alert">
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1.5 text-t-hint text-ims-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputClass, className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...props }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(textareaClass, className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <span className="relative block">
      <select ref={ref} aria-invalid={invalid || undefined} className={cn(selectClass, className)} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ims-muted" aria-hidden />
    </span>
  );
});

/** A checkbox with its label on the right (and an optional hint under it). */
export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
  id,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-2.5 text-t-body text-ims-text", disabled && "cursor-not-allowed opacity-60", className)}>
      <input id={id} type="checkbox" className={checkboxClass} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-t-hint text-ims-muted">{hint}</span>}
      </span>
    </label>
  );
}
export const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ims-field accent-ims-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus disabled:cursor-not-allowed";

/** Money: the currency (RWF) before the number, thousands separators while typing, whole units. */
export function MoneyInput({
  value,
  onChange,
  id,
  invalid,
  placeholder = "0",
  disabled,
  className,
  currency = "RWF",
  "aria-label": ariaLabel,
}: {
  value: number | "" | null | undefined;
  onChange: (v: number | "") => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Shown before the number; RWF unless the document is in another currency. */
  currency?: string;
  /** For inputs without a visible label (inside table rows). */
  "aria-label"?: string;
}) {
  const shown = value === "" || value === null || value === undefined ? "" : Number(value).toLocaleString("en-US");
  return (
    <span className={cn("relative block", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ims-muted">{currency}</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={shown}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits ? Number(digits) : "");
        }}
        className={cn(inputClass, "pl-12 text-right tabular-nums")}
      />
    </span>
  );
}

/** Date picker that shows "25 Nov 2026"; value and onChange use "yyyy-MM-dd". */
export function DatePicker({
  value,
  onChange,
  id,
  invalid,
  placeholder = "Choose a date",
  disabled,
  min,
  max,
  className,
}: {
  value?: string | null;
  onChange: (v: string) => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const d = toDate(value || null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-haspopup="dialog"
          className={cn(inputClass, "flex items-center justify-between gap-2 text-left", !d && "text-ims-faint", className)}
        >
          <span className="truncate">{d ? format(d, "d MMM yyyy") : placeholder}</span>
          <CalendarDays size={16} className="shrink-0 text-ims-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-card border-ims-border p-0 shadow-menu">
        <Calendar
          mode="single"
          selected={d || undefined}
          defaultMonth={d || undefined}
          disabled={[...(min ? [{ before: toDate(min)! }] : []), ...(max ? [{ after: toDate(max)! }] : [])]}
          onSelect={(day) => {
            if (day) onChange(format(day, "yyyy-MM-dd"));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ structure
/** Numbered section of a long form. Numbers count up by themselves inside <FormBody>. */
export function FormSection({ title, description, number, children, className, id }: { title: string; description?: React.ReactNode; number?: number; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-card border border-ims-border bg-ims-card px-[18px] py-[18px] [counter-increment:ims-section] sm:px-5 sm:py-5", className)}>
      <header className="mb-4">
        <h2 className="text-t-section text-ims-text">
          {number !== undefined ? <span>{number}</span> : <span className="before:content-[counter(ims-section)]" />}
          <span className="px-1.5 text-ims-faint">·</span>
          {title}
        </h2>
        {description && <p className="mt-0.5 text-t-small text-ims-muted">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** The form's main column (numbers its sections) and, on desktop, a summary panel on the right. */
export function FormBody({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4", aside && "lg:grid-cols-[minmax(0,1fr)_320px]", className)}>
      <div className="min-w-0 space-y-4 [counter-reset:ims-section]">{children}</div>
      {aside && <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">{aside}</aside>}
    </div>
  );
}

export type FormError = { field?: string; message: string };

/** Shown at the top after Submit: what to fix, with links that jump to each field. */
export function ErrorSummary({ errors, title = "Check these fields before you submit" }: { errors: FormError[]; title?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const had = React.useRef(false);
  // Move focus here when errors first appear, not each time one is fixed.
  React.useEffect(() => {
    if (errors.length && !had.current) ref.current?.focus();
    had.current = errors.length > 0;
  }, [errors.length]);
  if (!errors.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-card border border-ims-danger/40 bg-ims-danger-bg px-5 py-4 text-ims-danger outline-none">
      <p className="flex items-center gap-2 text-[14px] font-bold"><AlertCircle size={16} aria-hidden /> {title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-9 text-t-small">
        {errors.map((e, i) => (
          <li key={`${e.field}-${i}`}>
            {e.field ? (
              <a
                href={`#${e.field}`}
                onClick={(ev) => {
                  ev.preventDefault();
                  const el = document.getElementById(e.field!);
                  el?.scrollIntoView({ block: "center", behavior: "smooth" });
                  (el as HTMLElement | null)?.focus?.();
                }}
                className="underline underline-offset-2 hover:no-underline"
              >
                {e.message}
              </a>
            ) : (
              e.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Right-side summary: key values and a live checklist of what is still needed. */
export function SummaryPanel({ title = "Summary", rows = [], checklist = [], children }: { title?: string; rows?: [string, React.ReactNode][]; checklist?: { label: string; done: boolean }[]; children?: React.ReactNode }) {
  return (
    <section className="rounded-card border border-ims-border bg-ims-card px-5 py-5">
      <h2 className="text-t-section text-ims-text">{title}</h2>
      {rows.length > 0 && (
        <dl className="mt-3 space-y-2 text-t-body">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-ims-muted">{k}</dt>
              <dd className="text-right font-semibold tabular-nums text-ims-text">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {checklist.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-ims-divider pt-4 text-t-body" aria-label="Checklist">
          {checklist.map((c) => (
            <li key={c.label} className={cn("flex items-start gap-2", c.done ? "text-ims-text" : "text-ims-muted")}>
              {c.done ? <Check size={16} className="mt-0.5 shrink-0 text-ims-success" aria-label="Done" /> : <Circle size={16} className="mt-0.5 shrink-0 text-ims-faint" aria-label="Still needed" />}
              {c.label}
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

/** Buttons at the bottom of a form: primary "Submit for approval", secondary "Save draft", link "Cancel". */
export function FormActions({
  submitLabel = "Submit for approval",
  onSubmit,
  submitType = "button",
  draftLabel = "Save draft",
  onSaveDraft,
  cancelTo,
  onCancel,
  busy,
  disabled,
  note,
}: {
  submitLabel?: string;
  onSubmit?: () => void;
  submitType?: "button" | "submit";
  draftLabel?: string;
  onSaveDraft?: () => void;
  cancelTo?: string;
  onCancel?: () => void;
  busy?: "submit" | "draft" | null | boolean;
  disabled?: boolean;
  note?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t border-ims-border bg-ims-card/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-card sm:border sm:px-5 sm:py-4">
      <div className="text-t-small text-ims-muted">{note}</div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        {cancelTo ? (
          <Link to={cancelTo} className="text-[14px] font-bold text-ims-link hover:underline">Cancel</Link>
        ) : onCancel ? (
          <button type="button" onClick={onCancel} className="text-[14px] font-bold text-ims-link hover:underline">Cancel</button>
        ) : null}
        {onSaveDraft && (
          <Button variant="secondary" onClick={onSaveDraft} loading={busy === "draft"} disabled={Boolean(busy) || disabled}>{draftLabel}</Button>
        )}
        <Button variant="primary" type={submitType} onClick={onSubmit} loading={busy === "submit" || busy === true} disabled={Boolean(busy) || disabled}>{submitLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Autosave a draft to this browser while the person types; returns when it was last saved and a
 * restore() for the next visit. The server copy is still saved with "Save draft".
 */
export function useAutosave<T>(key: string | null, value: T, enabled = true) {
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  React.useEffect(() => {
    if (!key || !enabled) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(`ims.draft.${key}`, JSON.stringify({ at: Date.now(), value }));
        setSavedAt(new Date());
      } catch (_) {
        /* storage full or blocked: drafts are a convenience */
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [key, enabled, JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  const restore = React.useCallback((): T | null => {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(`ims.draft.${key}`);
      return raw ? (JSON.parse(raw).value as T) : null;
    } catch (_) {
      return null;
    }
  }, [key]);
  const clear = React.useCallback(() => {
    if (!key) return;
    try {
      localStorage.removeItem(`ims.draft.${key}`);
    } catch (_) {
      /* ignore */
    }
  }, [key]);
  return { savedAt, restore, clear };
}
