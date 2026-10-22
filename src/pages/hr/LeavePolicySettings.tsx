import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/procurement";
import { showDate, toInputDate, toPbDate } from "@/components/portal/kit";
import { Button, Card, CardHeader, Checkbox, Column, ConfirmDialog, DataTable, DatePicker, Field, Input, Modal, Select, StatusPill, Textarea, fmtDate, sentence } from "@/components/ims";
import { cn } from "@/utils";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const CATEGORIES = ["annual", "sick", "maternity", "paternity", "circumstantial", "study", "unpaid", "other"];

/** Shown as a tab of Settings (the Settings page draws the header). */
export default function LeavePolicySettings() {
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_leave_policy");
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="flex items-start gap-2 rounded-control bg-ims-info-bg px-3.5 py-2.5 text-t-small text-ims-info">
        <Info size={15} className="mt-px shrink-0" aria-hidden />
        <span>
          Defaults follow Law N° 66/2018 regulating labour in Rwanda. Confirm them against the current law, ministerial orders and the internal HR policy — every value below can be changed without development.
        </span>
      </p>
      {!canEdit && <p className="text-t-small text-ims-muted">You can view the leave policy. Changing it needs the “Manage leave types, public holidays and entitlement rules” permission.</p>}
      <Rules canEdit={canEdit} />
      <Types canEdit={canEdit} />
      <Holidays canEdit={canEdit} />
    </div>
  );
}

function Rules({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["settings-record"], () => pocketbase.collection("settings").getList(1, 1).then((r) => r.items[0]));
  const [v, setV] = React.useState<any>(null);
  React.useEffect(() => {
    if (q.data) setV({ ...q.data, working_days: q.data.working_days || ["monday", "tuesday", "wednesday", "thursday", "friday"] });
  }, [q.data]);
  const save = useMutation(
    () => pocketbase.collection("settings").update(v.id, {
      leave_accrual_per_month: Number(v.leave_accrual_per_month), leaves_per_year: Math.round(Number(v.leave_accrual_per_month) * 12 * 10) / 10,
      leave_seniority_every_years: Number(v.leave_seniority_every_years), leave_seniority_extra_days: Number(v.leave_seniority_extra_days),
      leave_seniority_max_days: Number(v.leave_seniority_max_days) || 0, max_carryover_leaves: Number(v.max_carryover_leaves),
      leave_allow_negative: Boolean(v.leave_allow_negative), working_days: v.working_days,
    }),
    {
      onSuccess: () => {
        toast.success("Leave rules saved");
        queryClient.invalidateQueries(["settings-record"]);
        queryClient.invalidateQueries(["settings"]);
        queryClient.invalidateQueries(["leave-balances"]);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  if (!v) return <Skeleton className="h-48 w-full rounded-card" />;
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Card>
      <CardHeader title="Annual leave entitlement" subtitle="How many days each employee earns per year" />
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Days earned per month of service" htmlFor="lp-accrual" hint={`= ${Math.round(Number(v.leave_accrual_per_month || 0) * 12 * 10) / 10} days per year`}>
          <Input id="lp-accrual" type="number" step={0.25} min={0} value={v.leave_accrual_per_month ?? ""} onChange={set("leave_accrual_per_month")} />
        </Field>
        <Field label="Extra days for seniority" htmlFor="lp-extra" hint="Added for every block of years below">
          <Input id="lp-extra" type="number" step={0.5} min={0} value={v.leave_seniority_extra_days ?? ""} onChange={set("leave_seniority_extra_days")} />
        </Field>
        <Field label="…for every (years of service)" htmlFor="lp-every">
          <Input id="lp-every" type="number" min={1} value={v.leave_seniority_every_years ?? ""} onChange={set("leave_seniority_every_years")} />
        </Field>
        <Field label="Maximum seniority days" htmlFor="lp-max" hint="0 = no limit">
          <Input id="lp-max" type="number" min={0} value={v.leave_seniority_max_days ?? 0} onChange={set("leave_seniority_max_days")} />
        </Field>
        <Field label="Maximum days carried to next year" htmlFor="lp-carry">
          <Input id="lp-carry" type="number" min={0} value={v.max_carryover_leaves ?? ""} onChange={set("max_carryover_leaves")} />
        </Field>
        <Checkbox
          className="self-end pb-2.5"
          label="Allow annual leave beyond the balance"
          checked={Boolean(v.leave_allow_negative)}
          disabled={!canEdit}
          onChange={(c) => setV((x: any) => ({ ...x, leave_allow_negative: c }))}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="mb-1.5 text-t-label text-ims-text" id="lp-days">Working days</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="lp-days">
            {DAYS.map((d) => {
              const on = v.working_days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setV((x: any) => ({ ...x, working_days: on ? x.working_days.filter((y: string) => y !== d) : [...x.working_days, d] }))}
                  className={cn(
                    "h-9 min-w-[52px] rounded-control border px-3 text-t-small font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus disabled:cursor-not-allowed disabled:opacity-60",
                    on ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-ims-field bg-ims-card text-ims-muted hover:bg-ims-subtle"
                  )}
                >
                  {sentence(d.slice(0, 3))}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-t-hint text-ims-muted">Other days are not counted as leave.</p>
        </div>
      </fieldset>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button variant="primary" loading={save.isLoading} onClick={() => save.mutate()}>Save rules</Button>
        </div>
      )}
    </Card>
  );
}

function Types({ canEdit }: { canEdit: boolean }) {
  const q = useQuery(["leave-types-all"], () => pocketbase.collection("leave_types").getFullList({ sort: "sort,name" }));
  const [editing, setEditing] = React.useState<any>(null);
  const columns: Column<any>[] = [
    { key: "name", header: "Type", clamp: true, width: "230px", cell: (t) => <span className="font-semibold">{t.name}</span>, sub: (t) => t.description },
    { key: "days", header: "Days", numeric: true, cell: (t) => t.days_per_year || (t.max_per_request ? `≤ ${t.max_per_request} per request` : <span className="text-ims-faint">—</span>) },
    { key: "basis", header: "Counted in", nowrap: true, cell: (t) => (t.day_basis === "calendar" ? "Calendar days" : "Working days"), sub: (t) => (t.deducts_annual ? "Deducted from annual leave" : null) },
    { key: "paid", header: "Paid", cell: (t) => (t.paid ? "Yes" : "No") },
    { key: "document", header: "Document", nowrap: true, cell: (t) => (t.requires_attachment ? `Required${t.attachment_after_days ? ` after ${t.attachment_after_days} days` : ""}` : <span className="text-ims-faint">—</span>) },
    { key: "for", header: "For", nowrap: true, cell: (t) => (t.eligible_gender === "any" ? "Everyone" : `${sentence(t.eligible_gender)} staff`) },
    { key: "legal", header: "Legal basis", clamp: true, width: "180px", cell: (t) => t.legal_reference || <span className="text-ims-faint">—</span> },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.active ? "Active" : "Inactive"} /> },
  ];
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          title="Leave types"
          subtitle="Shown to staff in the leave request form"
          action={
            <span className="flex flex-wrap items-center gap-2">
              <TableTools
                importConfig={IMPORTS.leaveTypes}
                exportConfig={{
                  title: "Leave types", fileName: "leave-types", what: "leave_types", rows: async () => q.data || [],
                  columns: [
                    { header: "Code", value: (r: any) => r.code || "" }, { header: "Leave type", value: (r: any) => r.name, width: 28 },
                    { header: "Category", value: (r: any) => r.category || "" }, { header: "Days per year", value: (r: any) => r.days_per_year || "", format: "number" },
                    { header: "Counted in", value: (r: any) => (r.day_basis === "calendar" ? "Calendar days" : "Working days") }, { header: "Paid", value: (r: any) => (r.paid ? "Yes" : "No") },
                    { header: "Legal reference", value: (r: any) => r.legal_reference || "", width: 30 },
                  ],
                }}
              />
              {canEdit && <Button size="sm" icon={Plus} onClick={() => setEditing({ active: true, day_basis: "working", paid: true, eligible_gender: "any", category: "other", sort: (q.data?.length || 0) + 1 })}>Add type</Button>}
            </span>
          }
        />
      </div>
      <DataTable
        caption="Leave types"
        columns={columns}
        rows={(q.data as any[]) || []}
        rowKey={(t) => t.id}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={980}
        onRowClick={canEdit ? (t) => setEditing(t) : undefined}
        rowActions={canEdit ? () => [{ label: "Edit", icon: Pencil, onSelect: (t) => setEditing(t) }] : undefined}
      />
      {editing && <TypeDialog value={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TypeDialog({ value, onClose }: { value: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState<any>(value);
  const save = useMutation(() => (v.id ? pocketbase.collection("leave_types").update(v.id, v) : pocketbase.collection("leave_types").create(v)), {
    onSuccess: () => {
      toast.success(`${v.name} saved`);
      queryClient.invalidateQueries(["leave-types-all"]);
      queryClient.invalidateQueries(["leave-types"]);
      onClose();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  const flag = (k: string) => (c: boolean) => setV((x: any) => ({ ...x, [k]: c }));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={v.id ? `Edit ${value.name}` : "New leave type"}
      description="Changes apply to new requests."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!v.name?.trim()} loading={save.isLoading} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required htmlFor="lt-name"><Input id="lt-name" value={v.name || ""} onChange={set("name")} /></Field>
        <Field label="Category" htmlFor="lt-category">
          <Select id="lt-category" value={v.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c} value={c}>{sentence(c)}</option>)}</Select>
        </Field>
        <Field label="Days per year" htmlFor="lt-days" hint="0 = no fixed yearly limit"><Input id="lt-days" type="number" min={0} value={v.days_per_year ?? 0} onChange={set("days_per_year")} /></Field>
        <Field label="Maximum per request" htmlFor="lt-max" hint="0 = no limit"><Input id="lt-max" type="number" min={0} value={v.max_per_request ?? 0} onChange={set("max_per_request")} /></Field>
        <Field label="Count" htmlFor="lt-basis">
          <Select id="lt-basis" value={v.day_basis} onChange={set("day_basis")}><option value="working">Working days</option><option value="calendar">Calendar days</option></Select>
        </Field>
        <Field label="Available to" htmlFor="lt-gender">
          <Select id="lt-gender" value={v.eligible_gender} onChange={set("eligible_gender")}><option value="any">Everyone</option><option value="female">Female staff</option><option value="male">Male staff</option></Select>
        </Field>
        <Field label="Document required after (days)" htmlFor="lt-after" hint="0 = always when required"><Input id="lt-after" type="number" min={0} value={v.attachment_after_days ?? 0} onChange={set("attachment_after_days")} /></Field>
        <Field label="Legal basis" htmlFor="lt-legal"><Input id="lt-legal" value={v.legal_reference || ""} onChange={set("legal_reference")} /></Field>
        <Field label="Description" htmlFor="lt-description" className="sm:col-span-2"><Textarea id="lt-description" rows={2} className="min-h-[72px]" value={v.description || ""} onChange={set("description")} /></Field>
        <div className="grid grid-cols-1 gap-2.5 sm:col-span-2 sm:grid-cols-2">
          {[["paid", "Paid leave"], ["deducts_annual", "Deducted from annual leave"], ["requires_attachment", "Supporting document required"], ["requires_specify", "Employee must specify the type"], ["active", "Active"]].map(([k, l]) => (
            <Checkbox key={k} label={l} checked={Boolean(v[k])} onChange={flag(k)} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function Holidays({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["public-holidays"], () => pocketbase.collection("public_holidays").getFullList({ sort: "date" }));
  const [editing, setEditing] = React.useState<any>(null);
  const [removing, setRemoving] = React.useState<any>(null);
  const del = useMutation((id: string) => pocketbase.collection("public_holidays").delete(id), {
    onSuccess: () => {
      toast.success(`${removing?.name || "Holiday"} removed`);
      queryClient.invalidateQueries(["public-holidays"]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const columns: Column<any>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (h) => (h.recurring ? showDate(h.date, "d MMMM") : fmtDate(h.date)), sub: (h) => (h.recurring ? null : showDate(h.date, "EEEE")) },
    { key: "name", header: "Holiday", clamp: true, cell: (h) => <span className="font-semibold">{h.name}</span>, sub: (h) => h.notes },
    { key: "repeats", header: "Repeats", cell: (h) => (h.recurring ? "Every year" : "This date only") },
    { key: "confirmed", header: "Date confirmed", cell: (h) => (h.confirmed ? "Yes" : <span className="font-semibold text-ims-warning">To confirm</span>) },
  ];
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          title="Public holidays"
          subtitle="Not counted as leave days. Recurring holidays repeat every year; movable feasts (Easter, Eid, Umuganura) are added for each year."
          action={
            <span className="flex flex-wrap items-center gap-2">
              <TableTools
                importConfig={IMPORTS.publicHolidays}
                exportConfig={{
                  title: "Public holidays", fileName: "public-holidays", what: "public_holidays", rows: async () => q.data || [],
                  columns: [
                    { header: "Date", value: (r: any) => r.date, format: "date" }, { header: "Holiday", value: (r: any) => r.name, width: 30 },
                    { header: "Every year", value: (r: any) => (r.recurring ? "Yes" : "No") }, { header: "Confirmed", value: (r: any) => (r.confirmed ? "Yes" : "No") },
                  ],
                }}
              />
              {canEdit && <Button size="sm" icon={Plus} onClick={() => setEditing({ recurring: false, confirmed: true, date: "" })}>Add holiday</Button>}
            </span>
          }
        />
      </div>
      <DataTable
        caption="Public holidays"
        columns={columns}
        rows={(q.data as any[]) || []}
        rowKey={(h) => h.id}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={640}
        onRowClick={canEdit ? (h) => setEditing(h) : undefined}
        rowActions={
          canEdit
            ? () => [
                { label: "Edit", icon: Pencil, onSelect: (h) => setEditing(h) },
                { label: "Remove", icon: Trash2, danger: true, onSelect: (h) => setRemoving(h) },
              ]
            : undefined
        }
      />
      {editing && <HolidayDialog value={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        danger
        title={`Remove ${removing?.name || "this holiday"}?`}
        description="The day will be counted as a leave day again."
        confirmLabel="Remove"
        onConfirm={() => del.mutateAsync(removing.id)}
      />
    </Card>
  );
}

function HolidayDialog({ value, onClose }: { value: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState({ ...value, date: toInputDate(value.date) });
  const save = useMutation(
    () => {
      const data = { name: v.name, date: toPbDate(v.date), recurring: Boolean(v.recurring), confirmed: Boolean(v.confirmed), notes: v.notes || "" };
      return v.id ? pocketbase.collection("public_holidays").update(v.id, data) : pocketbase.collection("public_holidays").create(data);
    },
    {
      onSuccess: () => {
        toast.success(`${v.name} saved`);
        queryClient.invalidateQueries(["public-holidays"]);
        onClose();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={v.id ? "Edit holiday" : "Add a public holiday"}
      description="Official list: Presidential order determining official holidays in Rwanda."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!v.name?.trim() || !v.date} loading={save.isLoading} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <Field label="Name" required htmlFor="ph-name"><Input id="ph-name" value={v.name || ""} onChange={(e) => setV((x: any) => ({ ...x, name: e.target.value }))} /></Field>
      <Field label="Date" required htmlFor="ph-date"><DatePicker id="ph-date" value={v.date} onChange={(d) => setV((x: any) => ({ ...x, date: d }))} /></Field>
      <div className="space-y-2.5">
        <Checkbox label="Same date every year" checked={Boolean(v.recurring)} onChange={(c) => setV((x: any) => ({ ...x, recurring: c }))} />
        <Checkbox label="Date confirmed by the government" checked={Boolean(v.confirmed)} onChange={(c) => setV((x: any) => ({ ...x, confirmed: c }))} />
      </div>
    </Modal>
  );
}
