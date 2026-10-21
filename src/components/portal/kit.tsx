/**
 * Employee portal building blocks — mobile first (most staff use the portal on a phone):
 * form fields, sections, segmented choices, file upload / preview / download, the signed-in
 * employee's profile, dates and working-day helpers.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertCircle, ArrowLeft, Download, Eye, File, FileImage, FileSpreadsheet, FileText, LucideIcon, Paperclip, UploadCloud, X,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ------------------------------------------------------------------ who am I
export interface Me {
  id: string;
  name: string;
  email: string;
  department: string;
  departmentName: string;
  designationName: string;
  hrScope: "own" | "department" | "all";
  isHead: boolean;
  raw: any;
}

/** The signed-in user with department, designation and HR visibility — used to auto-fill forms. */
export function useMe() {
  const id = (pocketbase.authStore.model as any)?.id;
  return useQuery(
    ["portal-me", id],
    async (): Promise<Me> => {
      const u: any = await pocketbase.collection("users").getOne(id, { expand: "department,designation,role" });
      return {
        id: u.id,
        name: u.name || u.names || u.email,
        email: u.email,
        department: u.department,
        departmentName: u.expand?.department?.name || "",
        designationName: u.expand?.designation?.name || "",
        hrScope: u.expand?.role?.hr_scope || "own",
        isHead: u.expand?.department?.head === u.id,
        raw: u,
      };
    },
    { enabled: Boolean(id), staleTime: 5 * 60_000 }
  );
}

// ------------------------------------------------------------------ dates
export const toInputDate = (v?: string | Date | null) => {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v.replace(" ", "T")) : v;
  if (isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd");
};
/** yyyy-MM-dd from an <input type="date"> → PocketBase datetime at midday UTC (no timezone day-shift). */
export const toPbDate = (v?: string) => (v ? `${v} 12:00:00.000Z` : "");
export const showDate = (v?: string, f = "d MMM yyyy") => {
  if (!v) return "—";
  const d = new Date(v.replace(" ", "T"));
  return isNaN(d.getTime()) ? "—" : format(d, f);
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Working days between two yyyy-MM-dd dates, inclusive. */
export function workingDays(start: string, end: string, working: string[] = ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
  if (!start || !end || end < start) return 0;
  let n = 0;
  const d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (d <= last) {
    if (working.includes(DAYS[d.getDay()])) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// ------------------------------------------------------------------ layout
export function FormPage({
  title,
  description,
  back,
  children,
  actions,
  aside,
}: {
  title: string;
  description?: React.ReactNode;
  back: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-28 pt-3 sm:px-6 sm:pb-10 sm:pt-5">
      <button type="button" onClick={() => navigate(back)} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-[20px] font-semibold tracking-tight text-slate-900 sm:text-[22px]">{title}</h1>
      {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      <div className={cn("mt-4 grid gap-4", aside && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0 space-y-4">{children}</div>
        {aside && <aside className="space-y-4">{aside}</aside>}
      </div>
      {/* Sticky on phones so the main action is always reachable with a thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:static sm:mt-5 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 [&>*]:flex-1 sm:[&>*]:flex-none">
        {actions}
      </div>
    </div>
  );
}

export function FormSection({ icon: Icon, title, description, children, className }: { icon?: LucideIcon; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5", className)}>
      <header className="mb-4 flex items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primaryDark">
            <Icon size={16} />
          </span>
        )}
        <div>
          <h2 className="text-[14.5px] font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-[12.5px] text-slate-500">{description}</p>}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | boolean | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {typeof error === "string" && error ? (
        <p className="mt-1 flex items-center gap-1 text-[12px] text-red-600" role="alert">
          <AlertCircle size={12} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  "block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 sm:h-10 sm:text-[13.5px] aria-[invalid=true]:border-red-400";
export const textareaCls = cn(inputCls, "h-auto min-h-[96px] py-2.5 leading-relaxed");

/** Read-only value that the system fills in (name, department…). */
export function AutoValue({ label, value, icon: Icon }: { label: string; value?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-medium text-slate-700">{label}</p>
      <div className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 text-[13.5px] text-slate-800 sm:h-10">
        {Icon && <Icon size={15} className="shrink-0 text-slate-400" />}
        <span className="truncate">{value || "—"}</span>
        <span className="ml-auto shrink-0 rounded bg-white px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">auto</span>
      </div>
    </div>
  );
}

/** Touch-friendly single choice (replaces small dropdowns for 2–5 options). */
export function Segmented<T extends string>({ value, onChange, options, className, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; className?: string; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("grid gap-1 rounded-lg bg-slate-100 p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          title={o.hint}
          className={cn(
            "min-h-[38px] rounded-md px-2 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Larger option cards with a description (e.g. leave types, plan kinds). */
export function ChoiceCards<T extends string>({ value, onChange, options, columns = 2 }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; description?: string; icon?: LucideIcon; disabled?: boolean }[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" className={cn("grid grid-cols-1 gap-2", cols)}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-slate-300")}>
              {active && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-slate-900">
                {o.icon && <o.icon size={14} className="text-slate-500" />}
                {o.label}
              </span>
              {o.description && <span className="block text-[12px] leading-snug text-slate-500">{o.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ files
const EXT_KIND: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  pdf: { icon: FileText, color: "text-red-600 bg-red-50", label: "PDF" },
  doc: { icon: FileText, color: "text-blue-600 bg-blue-50", label: "Word" },
  docx: { icon: FileText, color: "text-blue-600 bg-blue-50", label: "Word" },
  xls: { icon: FileSpreadsheet, color: "text-emerald-700 bg-emerald-50", label: "Excel" },
  xlsx: { icon: FileSpreadsheet, color: "text-emerald-700 bg-emerald-50", label: "Excel" },
  csv: { icon: FileSpreadsheet, color: "text-emerald-700 bg-emerald-50", label: "CSV" },
  png: { icon: FileImage, color: "text-violet-600 bg-violet-50", label: "Image" },
  jpg: { icon: FileImage, color: "text-violet-600 bg-violet-50", label: "Image" },
  jpeg: { icon: FileImage, color: "text-violet-600 bg-violet-50", label: "Image" },
  webp: { icon: FileImage, color: "text-violet-600 bg-violet-50", label: "Image" },
};
export const extOf = (name = "") => (name.split(".").pop() || "").toLowerCase();
export const fileKind = (name = "") => EXT_KIND[extOf(name)] || { icon: File, color: "text-slate-600 bg-slate-100", label: extOf(name).toUpperCase() || "File" };
/** PocketBase stores "original_abc123.pdf" — show "original.pdf". */
export const displayName = (stored = "") => stored.replace(/_[a-z0-9]{10}(\.[^.]+)?$/i, "$1");
export const fileUrl = (record: any, name: string, download = false) => (record && name ? pocketbase.files.getUrl(record, name, download ? { download: true } : {}) : "");
const canPreview = (name: string) => ["pdf", "png", "jpg", "jpeg", "webp", "gif"].includes(extOf(name));

export const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp";
const MAX_MB = 20;

/** Pick one or many files: drop zone on desktop, big tap target on phones, shows chosen files. */
export function FileDrop({ files, onChange, multiple = true, max = 10, accept = ACCEPT, label = "Add files", hint }: { files: File[]; onChange: (f: File[]) => void; multiple?: boolean; max?: number; accept?: string; label?: string; hint?: string }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const [error, setError] = React.useState("");
  const add = (list: FileList | null) => {
    if (!list) return;
    setError("");
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length > 1 ? "are" : "is"} larger than ${MAX_MB} MB.`);
    const ok = incoming.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    const next = multiple ? [...files, ...ok].slice(0, max) : ok.slice(0, 1);
    if (multiple && files.length + ok.length > max) setError(`You can attach up to ${max} files.`);
    onChange(next);
  };
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
          drag ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
        )}
      >
        <UploadCloud size={22} className="text-primaryDark" />
        <p className="text-[13.5px] font-medium text-slate-800">{label}</p>
        <p className="text-[12px] text-slate-500">{hint || `Tap to choose${multiple ? " (several allowed)" : ""} or drag here · PDF, Word, Excel, images · max ${MAX_MB} MB`}</p>
        <input ref={input} type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => {
            const k = fileKind(f.name);
            return (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", k.color)}><k.icon size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-slate-800">{f.name}</span>
                  <span className="text-[11.5px] text-slate-500">{k.label} · {(f.size / 1024 / 1024).toFixed(f.size > 1024 * 1024 ? 1 : 2)} MB</span>
                </span>
                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${f.name}`}>
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Stored attachments with preview and download. */
export function Attachments({ record, names, empty = "No attachments." }: { record: any; names: string[]; empty?: string }) {
  const [preview, setPreview] = React.useState<string | null>(null);
  if (!names.length) return <p className="text-[13px] text-slate-500">{empty}</p>;
  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {names.map((n) => {
          const k = fileKind(n);
          return (
            <li key={n} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", k.color)}><k.icon size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-800">{displayName(n)}</span>
                <span className="text-[11.5px] text-slate-500">{k.label}</span>
              </span>
              {canPreview(n) && (
                <button type="button" onClick={() => setPreview(n)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`View ${displayName(n)}`}>
                  <Eye size={16} />
                </button>
              )}
              <a href={fileUrl(record, n, true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Download ${displayName(n)}`}>
                <Download size={16} />
              </a>
            </li>
          );
        })}
      </ul>
      <FilePreview record={record} name={preview} onClose={() => setPreview(null)} />
    </>
  );
}

export function FilePreview({ record, name, title, onClose, footer }: { record: any; name: string | null; title?: string; onClose: () => void; footer?: React.ReactNode }) {
  const url = name ? fileUrl(record, name) : "";
  const ext = extOf(name || "");
  return (
    <Dialog open={Boolean(name)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col gap-0 bg-white p-0 sm:h-[90vh] sm:rounded-xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
          <DialogTitle className="truncate pr-8 text-[15px]">{title || displayName(name || "")}</DialogTitle>
          <DialogDescription className="text-[12px]">{fileKind(name || "").label} · {displayName(name || "")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 bg-slate-100">
          {ext === "pdf" ? (
            <iframe src={url} title={displayName(name || "")} className="h-full w-full" />
          ) : ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4"><img src={url} alt={displayName(name || "")} className="max-h-full max-w-full rounded shadow" /></div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-slate-600">
              <Paperclip size={22} /> This file type cannot be previewed in the browser. Download it to open.
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          {footer}
          <a href={fileUrl(record, name || "", true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primaryDark">
            <Download size={15} /> Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Build FormData from plain values; arrays become repeated keys, File lists are appended. */
export function toFormData(values: Record<string, unknown>, fileFields: Record<string, File[]> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (!v.length) fd.append(k, "");
      v.forEach((x) => fd.append(k, typeof x === "object" ? JSON.stringify(x) : String(x)));
    } else if (typeof v === "object") fd.append(k, JSON.stringify(v));
    else fd.append(k, String(v));
  }
  for (const [k, list] of Object.entries(fileFields)) for (const f of list) fd.append(k, f);
  return fd;
}

// ------------------------------------------------------------------ lists
export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full", v >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${v}%` }} />
      </div>
      <span className="w-9 text-right text-[11.5px] tabular-nums text-slate-500">{v}%</span>
    </div>
  );
}

export function ListToolbar({ search, onSearch, placeholder = "Search…", filters, action }: { search: string; onSearch: (v: string) => void; placeholder?: string; filters?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className={cn(inputCls, "sm:max-w-xs")} aria-label="Search" />
      {filters && <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:pb-0">{filters}</div>}
      {action && <div className="sm:ml-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  );
}

export function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium transition-colors",
        active ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
      )}
    >
      {children}
      {count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px]", active ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{count}</span>}
    </button>
  );
}

/**
 * Standard form dialog (same design as the leave request): icon header, scrollable body with sections,
 * footer with Cancel + primary action; full screen on phones.
 */
export function FormDialog({
  open, onClose, icon: Icon, title, description, children, submitLabel, busy, onSubmit, wide = false, footerExtra,
}: {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  submitLabel: string;
  busy?: boolean;
  onSubmit: () => void;
  wide?: boolean;
  footerExtra?: React.ReactNode;
}) {
  const formId = React.useId();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 bg-white p-0 sm:h-auto sm:max-h-[94vh] sm:rounded-xl", wide ? "max-w-4xl" : "max-w-2xl")}>
        <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primaryDark"><Icon size={19} /></span>
            <div className="min-w-0">
              <DialogTitle className="text-[16px]">{title}</DialogTitle>
              {description && <DialogDescription className="text-[12.5px]">{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6"
        >
          {children}
        </form>
        <div className="flex flex-row gap-2 border-t border-slate-100 px-4 py-3 sm:justify-end sm:px-6">
          {footerExtra}
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-4 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 sm:flex-none">Cancel</button>
          <button type="submit" form={formId} disabled={busy} className="h-10 flex-1 rounded-md bg-primary px-4 text-[13.5px] font-medium text-white hover:bg-primaryDark disabled:opacity-60 sm:flex-none">{busy ? "Saving…" : submitLabel}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FormBlock({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><Icon size={15} className="text-slate-400" /> {title}</h3>
      {children}
    </section>
  );
}
