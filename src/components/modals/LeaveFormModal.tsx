import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";
import AsyncSelectField from "@/components/AsyncSelectField";
import useSettings from "@/hooks/useSettings";
import { leaveApi } from "@/lib/hr";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { AutoValue, ChoiceCards, FileDrop, fileUrl, displayName, showDate, toFormData, toInputDate, toPbDate, useMe, workingDays } from "@/components/portal/kit";
import { Button, DatePicker, ErrorSummary, Field, FormError, Input, Modal, ModalSection, StatusPill, Textarea } from "@/components/ims";

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

/** Where each message of the error summary jumps to. */
const FIELD_ID: Record<string, string> = {
  employee: "leave-employee",
  type: "leave-type",
  other_type: "leave-other-type",
  end: "leave-end",
  balance: "leave-end",
  max: "leave-end",
  reason: "leave-reason",
  contact: "leave-contact",
  attachment: "leave-attachment",
};

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
  const err = (k: keyof typeof errors) => (tried && typeof errors[k] === "string" ? (errors[k] as string) : null);
  const summary: FormError[] = tried
    ? (Object.entries(errors) as [string, unknown][]).filter(([, m]) => typeof m === "string" && m).map(([k, m]) => ({ field: FIELD_ID[k], message: m as string }))
    : [];

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
      toast.success(record ? "Leave request updated" : `Leave request for ${days} day${days === 1 ? "" : "s"} sent for approval`);
      onComplete?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const emp: any = employeeQ.data;
  const periodError = errors.end || errors.balance || errors.max;
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      size="lg"
      title={record ? "Edit leave request" : "Request leave"}
      description="The request goes to the line manager for approval. Fields marked * are required."
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="leave-form" loading={saving}>
            {record ? "Save changes" : `Send request${days ? ` (${days} day${days === 1 ? "" : "s"})` : ""}`}
          </Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={submit} noValidate className="space-y-4">
        <ErrorSummary errors={summary} title="Check these fields before you send the request" />

        <ModalSection title="Employee">
          {lockedEmployee ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AutoValue label="Name" value={emp?.name || me.data?.name} />
              <AutoValue label="Department" value={emp?.expand?.department?.name} />
            </div>
          ) : (
            <Field label="Employee" required htmlFor="leave-employee" error={err("employee")}>
              <AsyncSelectField
                name="leave-employee"
                inputId="leave-employee"
                value={v.employee}
                placeholder="Search employee by name"
                className="!min-h-[42px] !rounded-control !shadow-none"
                onChange={(o: any) => setV((x) => ({ ...x, employee: o?.value || "" }))}
                loader={({ search }: any) =>
                  pocketbase.collection("users").getList(1, 30, { filter: search ? `name ~ "${String(search).replace(/"/g, "")}"` : "", sort: "name", fields: "id,name" }).then((r) => r.items.map((u: any) => ({ label: u.name, value: u.id })))
                }
              />
            </Field>
          )}
        </ModalSection>

        <ModalSection title="Leave type">
          <Field label="What kind of leave?" required error={err("type")}>
            <div id="leave-type" tabIndex={-1} className="outline-none">
              <ChoiceCards value={v.type} onChange={(t) => setV((x) => ({ ...x, type: t }))} options={types.map((t) => ({ value: t.value, label: t.value, description: t.description }))} />
            </div>
          </Field>
          {needsSpecify && (
            <Field label="Specify the type of leave" required htmlFor="leave-other-type" error={err("other_type")} hint="Saved with the request, e.g. civic duty, religious holiday, marriage.">
              <Input id="leave-other-type" value={v.other_type} onChange={set("other_type")} autoFocus placeholder="What kind of leave?" invalid={Boolean(err("other_type"))} />
            </Field>
          )}
          {selected?.deducts_annual && v.employee && (
            <dl className="grid grid-cols-3 divide-x divide-ims-divider rounded-control border border-ims-border bg-ims-thead text-center" aria-label="Annual leave balance">
              {[
                ["Entitlement", balanceQ.isLoading ? "…" : balance?.entitlement ?? "—"],
                ["Taken this year", balanceQ.isLoading ? "…" : balance?.taken ?? "—"],
                ["Available", balanceQ.isLoading ? "…" : balance?.available ?? "—"],
              ].map(([k, n]) => (
                <div key={k as string} className="px-2 py-2.5">
                  <dd className="text-t-section tabular-nums text-ims-text">{n}</dd>
                  <dt className="text-t-small text-ims-muted">{k}</dt>
                </div>
              ))}
            </dl>
          )}
        </ModalSection>

        <ModalSection title="Period">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First day" required htmlFor="leave-start">
              <DatePicker id="leave-start" value={v.start} onChange={(d) => setV((x) => ({ ...x, start: d, end: x.end < d ? d : x.end }))} />
            </Field>
            <Field label="Last day" required htmlFor="leave-end">
              <DatePicker id="leave-end" value={v.end} min={v.start} onChange={(d) => setV((x) => ({ ...x, end: d }))} invalid={Boolean(errors.end)} />
            </Field>
          </div>
          <div className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-control px-3 py-2.5 text-t-body", periodError ? "bg-ims-danger-bg text-ims-danger" : "bg-ims-thead text-ims-body")} aria-live="polite">
            <span>
              <span className="text-t-section tabular-nums text-ims-text">{days}</span> working day{days === 1 ? "" : "s"}
            </span>
            <span className="text-t-small text-ims-muted">
              {calendarDays} calendar day{calendarDays === 1 ? "" : "s"} · {showDate(v.start, "EEE d MMM")} – {showDate(v.end, "EEE d MMM yyyy")}
            </span>
            {periodError && <span className="basis-full text-t-small">{periodError}</span>}
            {holidaysIn.length > 0 && <span className="basis-full text-t-small text-ims-muted">Public holiday{holidaysIn.length > 1 ? "s" : ""} not counted: {holidaysIn.map((h) => `${h.name} (${showDate(h.date, "d MMM")})`).join(", ")}</span>}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-t-small text-ims-muted">
            Status after sending: <StatusPill status="Pending approval" />
          </p>
        </ModalSection>

        <ModalSection title="Details and contacts">
          <Field label="Reason" required htmlFor="leave-reason" error={err("reason")}>
            <Textarea id="leave-reason" rows={3} className="min-h-[88px]" value={v.reason} onChange={set("reason")} placeholder="Briefly explain the reason for the leave" invalid={Boolean(err("reason"))} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phone while on leave" htmlFor="leave-contact" error={err("contact")}>
              <Input id="leave-contact" type="tel" inputMode="tel" value={v.contact_during_leave} onChange={set("contact_during_leave")} placeholder={emp?.phone || "+250 7XX XXX XXX"} invalid={Boolean(err("contact"))} />
            </Field>
            <Field label="Emergency contact" htmlFor="leave-emergency" hint="Name and phone number">
              <Input id="leave-emergency" value={v.emergency_contact} onChange={set("emergency_contact")} placeholder="e.g. Jean Habimana, +250 788 000 000" />
            </Field>
          </div>
          <Field label="Supporting document" error={err("attachment")} hint={selected?.requires_attachment ? `Required for more than ${selected.attachment_after_days || 0} day(s).` : "Optional (e.g. invitation, certificate)."}>
            <div id="leave-attachment" tabIndex={-1} className="outline-none">
              {record?.attachment && !files.length && (
                <a href={fileUrl(record, record.attachment, true)} className="mb-2 block truncate text-t-small font-semibold text-ims-link hover:underline">Current file: {displayName(record.attachment)}</a>
              )}
              <FileDrop files={files} onChange={setFiles} multiple={false} label={record?.attachment ? "Replace the file" : "Attach a file"} />
            </div>
          </Field>
        </ModalSection>
      </form>
    </Modal>
  );
}
