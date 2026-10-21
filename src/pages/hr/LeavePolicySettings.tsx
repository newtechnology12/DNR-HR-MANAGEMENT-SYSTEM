import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { CalendarDays, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, Panel } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { Field, inputCls, showDate, textareaCls, toInputDate, toPbDate } from "@/components/portal/kit";
import { cn } from "@/utils";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const CATEGORIES = ["annual", "sick", "maternity", "paternity", "circumstantial", "study", "unpaid", "other"];

export default function LeavePolicySettings() {
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_leave_policy");
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-[12.5px] text-sky-900">
        Defaults follow Law N° 66/2018 regulating labour in Rwanda. Confirm them against the current law, ministerial orders and your internal HR policy — every value below can be changed without development.
        {!canEdit && " You can view the policy; changing it requires the “Manage leave types, public holidays and entitlement rules” permission."}
      </p>
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
  if (!v) return <Skeleton className="h-48 w-full" />;
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Panel title={<span className="flex items-center gap-2"><Scale size={16} className="text-slate-400" /> Annual leave entitlement</span>} subtitle="How many days each employee earns per year">
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Days earned per month of service" hint={`= ${Math.round(Number(v.leave_accrual_per_month || 0) * 12 * 10) / 10} days per year`}>
          <input type="number" step={0.25} min={0} className={inputCls} value={v.leave_accrual_per_month ?? ""} onChange={set("leave_accrual_per_month")} />
        </Field>
        <Field label="Extra days for seniority" hint="Added for every block of years below">
          <input type="number" step={0.5} min={0} className={inputCls} value={v.leave_seniority_extra_days ?? ""} onChange={set("leave_seniority_extra_days")} />
        </Field>
        <Field label="…for every (years of service)">
          <input type="number" min={1} className={inputCls} value={v.leave_seniority_every_years ?? ""} onChange={set("leave_seniority_every_years")} />
        </Field>
        <Field label="Maximum seniority days" hint="0 = no limit">
          <input type="number" min={0} className={inputCls} value={v.leave_seniority_max_days ?? 0} onChange={set("leave_seniority_max_days")} />
        </Field>
        <Field label="Maximum days carried to next year">
          <input type="number" min={0} className={inputCls} value={v.max_carryover_leaves ?? ""} onChange={set("max_carryover_leaves")} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={Boolean(v.leave_allow_negative)} onChange={set("leave_allow_negative")} className="h-4 w-4" /> Allow annual leave beyond the balance
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Working days (other days are not counted as leave)</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const on = v.working_days.includes(d);
              return (
                <button key={d} type="button" onClick={() => setV((x: any) => ({ ...x, working_days: on ? x.working_days.filter((y: string) => y !== d) : [...x.working_days, d] }))} className={cn("h-9 rounded-md border px-3 text-[13px] capitalize", on ? "border-primary bg-primary/10 text-primaryDark" : "border-slate-200 text-slate-500")}>
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>
      {canEdit && <div className="mt-4 flex justify-end"><Button disabled={save.isLoading} onClick={() => save.mutate()}>Save rules</Button></div>}
    </Panel>
  );
}

function Types({ canEdit }: { canEdit: boolean }) {
  const q = useQuery(["leave-types-all"], () => pocketbase.collection("leave_types").getFullList({ sort: "sort,name" }));
  const [editing, setEditing] = React.useState<any>(null);
  return (
    <Panel
      title="Leave types"
      subtitle="Shown to staff in the leave request form"
      bodyClassName="px-0"
      action={canEdit && <Button size="sm" variant="outline" onClick={() => setEditing({ active: true, day_basis: "working", paid: true, eligible_gender: "any", category: "other", sort: (q.data?.length || 0) + 1 })}><Plus size={14} /> Add type</Button>}
    >
      <div className="overflow-x-auto">
        <table className="dnr-grid w-full min-w-[900px] text-[13px]">
          <thead><tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2">Counted in</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Document</th><th className="px-3 py-2">For</th><th className="px-3 py-2">Legal basis</th><th className="px-3 py-2">Status</th>{canEdit && <th className="w-10" />}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(q.data || []).map((t: any) => (
              <tr key={t.id}>
                <td className="px-3 py-2"><p className="font-medium">{t.name}</p><p className="max-w-[320px] text-[12px] text-slate-500">{t.description}</p></td>
                <td className="px-3 py-2 text-right tabular-nums">{t.days_per_year || (t.max_per_request ? `≤ ${t.max_per_request}/request` : "—")}</td>
                <td className="px-3 py-2 text-slate-600">{t.day_basis === "calendar" ? "Calendar days" : "Working days"}{t.deducts_annual && <span className="block text-[11.5px] text-primaryDark">Deducted from annual leave</span>}</td>
                <td className="px-3 py-2">{t.paid ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-slate-600">{t.requires_attachment ? `Required${t.attachment_after_days ? ` after ${t.attachment_after_days} days` : ""}` : "—"}</td>
                <td className="px-3 py-2 capitalize text-slate-600">{t.eligible_gender === "any" ? "Everyone" : `${t.eligible_gender} staff`}</td>
                <td className="px-3 py-2 text-[12px] text-slate-500">{t.legal_reference || "—"}</td>
                <td className="px-3 py-2">{t.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Off</Badge>}</td>
                {canEdit && <td className="px-2 py-2"><button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <TypeDialog value={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function TypeDialog({ value, onClose }: { value: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState<any>(value);
  const save = useMutation(() => (v.id ? pocketbase.collection("leave_types").update(v.id, v) : pocketbase.collection("leave_types").create(v)), {
    onSuccess: () => {
      toast.success("Leave type saved");
      queryClient.invalidateQueries(["leave-types-all"]);
      queryClient.invalidateQueries(["leave-types"]);
      onClose();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white">
        <DialogHeader><DialogTitle>{v.id ? `Edit ${value.name}` : "New leave type"}</DialogTitle><DialogDescription>Changes apply to new requests.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required><input className={inputCls} value={v.name || ""} onChange={set("name")} /></Field>
          <Field label="Category"><select className={cn(inputCls, "capitalize")} value={v.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Days per year" hint="0 = no fixed yearly limit"><input type="number" min={0} className={inputCls} value={v.days_per_year ?? 0} onChange={set("days_per_year")} /></Field>
          <Field label="Maximum per request" hint="0 = no limit"><input type="number" min={0} className={inputCls} value={v.max_per_request ?? 0} onChange={set("max_per_request")} /></Field>
          <Field label="Count"><select className={inputCls} value={v.day_basis} onChange={set("day_basis")}><option value="working">Working days</option><option value="calendar">Calendar days</option></select></Field>
          <Field label="Available to"><select className={inputCls} value={v.eligible_gender} onChange={set("eligible_gender")}><option value="any">Everyone</option><option value="female">Female staff</option><option value="male">Male staff</option></select></Field>
          <Field label="Document required after (days)" hint="0 = always when required"><input type="number" min={0} className={inputCls} value={v.attachment_after_days ?? 0} onChange={set("attachment_after_days")} /></Field>
          <Field label="Legal basis"><input className={inputCls} value={v.legal_reference || ""} onChange={set("legal_reference")} /></Field>
          <Field label="Description" className="sm:col-span-2"><textarea className={textareaCls} rows={2} value={v.description || ""} onChange={set("description")} /></Field>
          <div className="grid grid-cols-2 gap-2 text-[13px] sm:col-span-2">
            {[["paid", "Paid leave"], ["deducts_annual", "Deducted from annual leave"], ["requires_attachment", "Supporting document required"], ["requires_specify", "Employee must specify the type"], ["active", "Active"]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={Boolean(v[k])} onChange={set(k)} /> {l}</label>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!v.name?.trim() || save.isLoading} onClick={() => save.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Holidays({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["public-holidays"], () => pocketbase.collection("public_holidays").getFullList({ sort: "date" }));
  const [editing, setEditing] = React.useState<any>(null);
  const del = useMutation((id: string) => pocketbase.collection("public_holidays").delete(id), {
    onSuccess: () => {
      toast.success("Holiday removed");
      queryClient.invalidateQueries(["public-holidays"]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Panel
      title={<span className="flex items-center gap-2"><CalendarDays size={16} className="text-slate-400" /> Public holidays</span>}
      subtitle="Not counted as leave days. Recurring holidays repeat every year; movable feasts (Easter, Eid, Umuganura) must be added for each year."
      bodyClassName="px-0"
      action={canEdit && <Button size="sm" variant="outline" onClick={() => setEditing({ recurring: false, confirmed: true, date: "" })}><Plus size={14} /> Add holiday</Button>}
    >
      {q.isLoading ? <div className="px-4"><Skeleton className="h-32 w-full" /></div> : (
        <table className="dnr-grid w-full text-[13px]">
          <thead><tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Holiday</th><th className="px-3 py-2">Repeats</th><th className="px-3 py-2">Status</th>{canEdit && <th className="w-20" />}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(q.data || []).map((h: any) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{showDate(h.date, h.recurring ? "d MMMM" : "EEE d MMM yyyy")}</td>
                <td className="px-3 py-2">{h.name}{h.notes && <span className="block text-[12px] text-slate-500">{h.notes}</span>}</td>
                <td className="px-3 py-2 text-slate-600">{h.recurring ? "Every year" : "This date only"}</td>
                <td className="px-3 py-2">{h.confirmed ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">To confirm</Badge>}</td>
                {canEdit && (
                  <td className="px-2 py-2 text-right">
                    <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(h)} aria-label={`Edit ${h.name}`}><Pencil size={14} /></button>
                    <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => del.mutate(h.id)} aria-label={`Remove ${h.name}`}><Trash2 size={14} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <HolidayDialog value={editing} onClose={() => setEditing(null)} />}
    </Panel>
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
        toast.success("Holiday saved");
        queryClient.invalidateQueries(["public-holidays"]);
        onClose();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>{v.id ? "Edit holiday" : "Add a public holiday"}</DialogTitle><DialogDescription>Official list: Presidential order determining official holidays in Rwanda.</DialogDescription></DialogHeader>
        <Field label="Name" required><input className={inputCls} value={v.name || ""} onChange={(e) => setV((x: any) => ({ ...x, name: e.target.value }))} /></Field>
        <Field label="Date" required><input type="date" className={inputCls} value={v.date} onChange={(e) => setV((x: any) => ({ ...x, date: e.target.value }))} /></Field>
        <div className="space-y-2 text-[13px]">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={Boolean(v.recurring)} onChange={(e) => setV((x: any) => ({ ...x, recurring: e.target.checked }))} /> Same date every year</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={Boolean(v.confirmed)} onChange={(e) => setV((x: any) => ({ ...x, confirmed: e.target.checked }))} /> Date confirmed by the government</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!v.name?.trim() || !v.date || save.isLoading} onClick={() => save.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
