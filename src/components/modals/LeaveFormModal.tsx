import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertCircle, CalendarDays, CalendarRange, FileText, Phone, User } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AsyncSelectField from "@/components/AsyncSelectField";
import useSettings from "@/hooks/useSettings";
import { leaveApi } from "@/lib/hr";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { AutoValue, Field, FileDrop, fileUrl, displayName, inputCls, showDate, textareaCls, toFormData, toInputDate, toPbDate, useMe, workingDays } from "@/components/portal/kit";

export const LEAVE_TYPES = [
  { value: "Annual Leave", description: "Paid holiday from your yearly entitlement" },
  { value: "Sick Leave", description: "Illness or medical treatment — attach a medical note" },
  { value: "Maternity Leave", description: "Before and after giving birth" },
  { value: "Paternity Leave", description: "Following the birth of your child" },
  { value: "Compassionate Leave", description: "Bereavement or serious family emergency" },
  { value: "Study Leave", description: "Examinations or approved training" },
  { value: "Unpaid Leave", description: "Time off without pay" },
  { value: "Other", description: "Any other reason — you will be asked to specify" },
];

/** "Other — Civic duty" when the type was specified. */
export const leaveTypeLabel = (l: any) => (l?.type === "Other" && l?.other_type ? `Other — ${l.other_type}` : l?.type || "—");

const PHONE = /^\+?[0-9 ]{9,15}$/;
const today = () => new Date().toISOString().slice(0, 10);

export function LeaveFormModal({ open, setOpen, record, onComplete, employeeId }: any) {
  const me = useMe();
  const { settings } = useSettings();
  const working: string[] = settings?.working_days?.length ? settings.working_days : undefined;
  const blank = React.useCallback(
    () => ({
      employee: employeeId || record?.employee || "",
      type: record?.type || "",
      other_type: record?.other_type || "",
      start: toInputDate(record?.start) || today(),
      end: toInputDate(record?.end) || today(),
      reason: record?.reason || "",
      contact_during_leave: record?.contact_during_leave || "",
      emergency_contact: record?.emergency_contact || "",
    }),
    [record, employeeId]
  );
  const [v, setV] = React.useState(blank);
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setV(blank());
      setFiles([]);
      setTried(false);
    }
  }, [open, blank]);

  // Staff file their own leave; HR (or a head, from the HR pages) can choose the employee.
  const lockedEmployee = employeeId || (me.data && me.data.hrScope === "own" ? me.data.id : "");
  React.useEffect(() => {
    if (open && lockedEmployee && !v.employee) setV((x) => ({ ...x, employee: lockedEmployee }));
  }, [open, lockedEmployee, v.employee]);

  const employeeQ = useQuery(["leave-employee", v.employee], () => pocketbase.collection("users").getOne(v.employee, { expand: "department,designation" }), { enabled: Boolean(v.employee) && open });
  const year = Number((v.start || "").slice(0, 4)) || new Date().getFullYear();
  const balanceQ = useQuery(["leave-balance", v.employee, year], () => leaveApi.balances(year, { employee: v.employee }).then((r) => r.items[0]), { enabled: Boolean(v.employee) && open });
  const typesQ = useQuery(["leave-types"], () => pocketbase.collection("leave_types").getFullList({ filter: "active = true", sort: "sort,name" }), { enabled: open, staleTime: 5 * 60_000 });
  const gender = String((employeeQ.data as any)?.gender || "").toLowerCase();
  const types = (typesQ.data as any[] | undefined)?.filter((t) => !t.eligible_gender || t.eligible_gender === "any" || !gender || t.eligible_gender === gender).map((t) => ({ value: t.name, description: t.description, meta: t })) || LEAVE_TYPES.map((t) => ({ ...t, meta: null as any }));
  const selected: any = types.find((t) => t.value === v.type)?.meta;
  const needsSpecify = v.type === "Other" || Boolean(selected?.requires_specify);
  const countQ = useQuery(["leave-count", v.start, v.end, v.type], () => leaveApi.count(v.start, v.end, v.type || "Annual Leave"), { enabled: open && Boolean(v.start && v.end) && v.end >= v.start, keepPreviousData: true });

  const days = countQ.data?.days ?? workingDays(v.start, v.end, working);
  const holidaysIn = countQ.data?.holidays || [];
  const calendarDays = v.start && v.end && v.end >= v.start ? Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 864e5) + 1 : 0;
  const balance = balanceQ.data;
  const errors = {
    employee: !v.employee && "Choose the employee.",
    type: !v.type && "Choose the type of leave.",
    other_type: needsSpecify && v.other_type.trim().length < 3 && "Say what kind of leave this is (at least 3 characters).",
    end: v.end < v.start ? "The last day cannot be before the first day." : days === 0 ? "The selected period has no working days." : days > 180 ? "A single request cannot exceed 180 working days." : false,
    reason: v.reason.trim().length < 5 && "Give a short reason (at least 5 characters).",
    contact: v.contact_during_leave && !PHONE.test(v.contact_during_leave.trim()) && "Enter a valid phone number, e.g. +250 788 123 456.",
    balance: selected?.deducts_annual && balance && days > balance.available - (record && record.status === "pending" ? Number(record.days) || 0 : 0) && `Only ${Math.max(0, balance.available)} annual leave day${balance.available === 1 ? "" : "s"} available; you asked for ${days}.`,
    max: selected?.max_per_request > 0 && days > selected.max_per_request && `${v.type} is limited to ${selected.max_per_request} days per request.`,
    attachment: selected?.requires_attachment && days > (selected.attachment_after_days || 0) && !files.length && !record?.attachment && `Attach a supporting document for ${v.type.toLowerCase()} of more than ${selected.attachment_after_days || 0} day(s).`,
  };
  const invalid = Object.values(errors).some(Boolean);
  const set = (k: keyof ReturnType<typeof blank>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    setSaving(true);
    const data = {
      employee: v.employee,
      type: v.type,
      other_type: needsSpecify ? v.other_type.trim() : "",
      start: toPbDate(v.start),
      end: toPbDate(v.end),
      days,
      Leaveduration: days,
      reason: v.reason.trim(),
      contact_during_leave: v.contact_during_leave.trim(),
      emergency_contact: v.emergency_contact.trim(),
    };
    try {
      const fd = toFormData(data, files.length ? { attachment: files } : {});
      if (record) await pocketbase.collection("leaves").update(record.id, fd);
      else await pocketbase.collection("leaves").create(fd);
      toast.success(record ? "Leave request updated" : "Leave request sent for approval");
      onComplete?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const emp: any = employeeQ.data;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col gap-0 bg-white p-0 sm:h-auto sm:max-h-[94vh] sm:rounded-xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primaryDark"><CalendarDays size={19} /></span>
            <div className="min-w-0">
              <DialogTitle className="text-[16px]">{record ? "Edit leave request" : "Request leave"}</DialogTitle>
              <DialogDescription className="text-[12.5px]">Your request goes to your manager for approval. <span className="text-red-600">*</span> required</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form id="leave-form" onSubmit={submit} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          {/* Employee */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><User size={15} className="text-slate-400" /> Employee</h3>
            {lockedEmployee ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AutoValue label="Name" value={emp?.name || me.data?.name} />
                <AutoValue label="Department" value={emp?.expand?.department?.name} />
              </div>
            ) : (
              <Field label="Employee" required error={tried && errors.employee}>
                <AsyncSelectField
                  name="leave-employee"
                  value={v.employee}
                  placeholder="Search employee by name"
                  onChange={(o: any) => setV((x) => ({ ...x, employee: o?.value || "" }))}
                  loader={({ search }: any) =>
                    pocketbase.collection("users").getList(1, 30, { filter: search ? `name ~ "${String(search).replace(/"/g, "")}"` : "", sort: "name", fields: "id,name" }).then((r) => r.items.map((u: any) => ({ label: u.name, value: u.id })))
                  }
                />
              </Field>
            )}
          </section>

          {/* Type */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><FileText size={15} className="text-slate-400" /> Type of leave <span className="text-red-600">*</span></h3>
            <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {types.map((t) => {
                const active = v.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setV((x) => ({ ...x, type: t.value }))}
                    className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 hover:border-slate-300")}
                  >
                    <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-slate-300")}>{active && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
                    <span>
                      <span className="block text-[13.5px] font-medium text-slate-900">{t.value}</span>
                      <span className="block text-[12px] leading-snug text-slate-500">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {tried && errors.type && <p className="flex items-center gap-1 text-[12px] text-red-600"><AlertCircle size={12} /> {errors.type}</p>}
            {needsSpecify && (
              <Field label="Specify the type of leave" required error={tried && errors.other_type} hint="Saved with your request, e.g. civic duty, religious holiday, marriage.">
                <input className={inputCls} value={v.other_type} onChange={set("other_type")} autoFocus placeholder="What kind of leave?" aria-invalid={Boolean(tried && errors.other_type)} />
              </Field>
            )}
            {selected?.deducts_annual && v.employee && (
              <div className="grid grid-cols-3 divide-x divide-blue-100 rounded-lg border border-blue-100 bg-blue-50/70 text-center">
                {[
                  ["Entitlement", balanceQ.isLoading ? "…" : balance?.entitlement ?? "—"],
                  ["Taken this year", balanceQ.isLoading ? "…" : balance?.taken ?? "—"],
                  ["Available", balanceQ.isLoading ? "…" : balance?.available ?? "—"],
                ].map(([k, n]) => (
                  <div key={k as string} className="px-2 py-2">
                    <p className="text-[17px] font-semibold tabular-nums text-blue-900">{n}</p>
                    <p className="text-[11.5px] text-blue-700">{k}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Period */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><CalendarRange size={15} className="text-slate-400" /> Period</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First day" required>
                <input type="date" className={inputCls} value={v.start} onChange={(e) => setV((x) => ({ ...x, start: e.target.value, end: x.end < e.target.value ? e.target.value : x.end }))} />
              </Field>
              <Field label="Last day" required>
                <input type="date" className={inputCls} value={v.end} min={v.start} onChange={set("end")} aria-invalid={Boolean(errors.end)} />
              </Field>
            </div>
            <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 text-[13px]", errors.end || errors.balance || errors.max ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700")}>
              <span><span className="text-[18px] font-semibold tabular-nums text-slate-900">{days}</span> working day{days === 1 ? "" : "s"}</span>
              <span className="text-slate-500">{calendarDays} calendar day{calendarDays === 1 ? "" : "s"} · {showDate(v.start, "EEE d MMM")} → {showDate(v.end, "EEE d MMM yyyy")}</span>
              {(errors.end || errors.balance || errors.max) && <span className="basis-full text-[12px]">{errors.end || errors.balance || errors.max}</span>}
              {holidaysIn.length > 0 && <span className="basis-full text-[12px] text-slate-500">Public holiday{holidaysIn.length > 1 ? "s" : ""} not counted: {holidaysIn.map((h) => `${h.name} (${showDate(h.date, "d MMM")})`).join(", ")}</span>}
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
              Status after sending: <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">Pending approval</span>
            </div>
          </section>

          {/* Details */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><Phone size={15} className="text-slate-400" /> Details and contacts</h3>
            <Field label="Reason" required error={tried && errors.reason}>
              <textarea className={textareaCls} rows={3} value={v.reason} onChange={set("reason")} placeholder="Briefly explain the reason for your leave" aria-invalid={Boolean(tried && errors.reason)} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone while on leave" error={tried && errors.contact}>
                <input type="tel" inputMode="tel" className={inputCls} value={v.contact_during_leave} onChange={set("contact_during_leave")} placeholder={emp?.phone || "+250 7XX XXX XXX"} />
              </Field>
              <Field label="Emergency contact" hint="Name and phone number">
                <input className={inputCls} value={v.emergency_contact} onChange={set("emergency_contact")} placeholder="e.g. Jean Habimana, +250 788 000 000" />
              </Field>
            </div>
            <Field label="Supporting document" error={tried && errors.attachment} hint={selected?.requires_attachment ? `Required for more than ${selected.attachment_after_days || 0} day(s).` : "Optional (e.g. invitation, certificate)."}>
              {record?.attachment && !files.length && (
                <a href={fileUrl(record, record.attachment, true)} className="mb-2 block truncate text-[12.5px] text-primaryDark hover:underline">Current file: {displayName(record.attachment)}</a>
              )}
              <FileDrop files={files} onChange={setFiles} multiple={false} label={record?.attachment ? "Replace the file" : "Attach a file"} />
            </Field>
          </section>
        </form>

        <DialogFooter className="flex-row gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" className="h-10 flex-1 sm:flex-none" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="leave-form" className="h-10 flex-1 sm:flex-none" disabled={saving}>
            {saving ? "Sending…" : record ? "Save changes" : `Send request${days ? ` (${days} day${days === 1 ? "" : "s"})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
