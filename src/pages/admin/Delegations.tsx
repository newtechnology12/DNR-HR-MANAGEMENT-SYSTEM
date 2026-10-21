/**
 * Approvals → Delegations (IMS §3 rule 8): an approver on leave hands their approvals to a named
 * person for a date range. The delegate acts "on behalf of" the delegator — shown on every approval.
 * Segregation of duties still applies to the delegate (never their own documents, never twice).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { ArrowRight, CalendarRange, Info, Plus, Split, UserCheck } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { DOCUMENT_TYPE_LABELS, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Initials, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
function state(d: any): { label: string; tone: "success" | "info" | "neutral" } {
  const now = new Date().toISOString().replace("T", " ");
  if (!d.active) return { label: d.cancelled_at ? "Ended early" : "Ended", tone: "neutral" };
  if (d.start_date > now) return { label: "Scheduled", tone: "info" };
  if (d.end_date < now) return { label: "Ended", tone: "neutral" };
  return { label: "Active now", tone: "success" };
}

export default function Delegations() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const manageAll = can("manage_delegations");
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);

  const q = useQuery(["delegations"], async () => {
    const [list, people] = await Promise.all([
      pocketbase.collection("delegations").getFullList({ sort: "-start_date", expand: "delegator,delegate,cancelled_by" }),
      pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", fields: "id,name,email,role,extra_roles", expand: "role" }),
    ]);
    return { list, people };
  });
  const list: any[] = q.data?.list || [];
  const mine = list.filter((d) => d.delegator === user?.id);
  const toMe = list.filter((d) => d.delegate === user?.id);
  const others = manageAll ? list.filter((d) => d.delegator !== user?.id && d.delegate !== user?.id) : [];
  const NEVER = ["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER"];
  const candidates = (q.data?.people || []).filter((p: any) => p.id !== user?.id && !NEVER.includes(p.expand?.role?.code));

  async function save() {
    if (!form.delegate || !form.start_date || !form.end_date || !form.reason?.trim()) return toast.error("Choose the person, the dates and the reason.");
    setBusy(true);
    try {
      await pocketbase.collection("delegations").create({ delegate: form.delegate, start_date: form.start_date, end_date: form.end_date, reason: form.reason.trim(), document_types: form.all ? [] : form.types });
      toast.success("Delegation saved — the delegate has been notified");
      setForm(null);
      queryClient.invalidateQueries(["delegations"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function end(d: any) {
    try {
      await pocketbase.collection("delegations").update(d.id, { active: false });
      toast.success("Delegation ended");
      queryClient.invalidateQueries(["delegations"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const Row = ({ d, canEnd }: { d: any; canEnd: boolean }) => {
    const s = state(d);
    const types: string[] = d.document_types || [];
    return (
      <li className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <Initials name={d.expand?.delegator?.name} />
          <ArrowRight size={14} className="shrink-0 text-slate-400" />
          <Initials name={d.expand?.delegate?.name} className="bg-primary/10 text-primaryDark" />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium text-slate-900">{d.expand?.delegator?.name} → {d.expand?.delegate?.name}</span>
            <span className="block truncate text-[12px] text-slate-500">{d.reason} · {types.length ? types.map((t) => DOCUMENT_TYPE_LABELS[t] || t).join(", ") : "All documents"}</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12.5px] text-slate-600"><CalendarRange size={14} className="text-slate-400" /> {showDay(d.start_date)} – {showDay(d.end_date)}</span>
          <Badge tone={s.tone}>{s.label}</Badge>
          {canEnd && d.active && s.label !== "Ended" && <Button size="sm" variant="outline" onClick={() => end(d)}>End now</Button>}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Delegations"
        description="Going on leave or mission? Hand your approvals to a named colleague for a date range."
        breadcrumbs={[{ title: "Approvals", link: "/dashboard/approvals" }, { title: "Delegations", link: "/dashboard/admin/delegations" }]}
        actions={<Button onClick={() => setForm({ start_date: today(), end_date: today(), all: true, types: [], reason: "" })}><Plus size={15} /> Delegate my approvals</Button>}
      />
      <p className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-blue-900">
        <Info size={14} className="mt-0.5 shrink-0" />
        The delegate sees your pending approvals and decides “on behalf of” you. They can never approve a document they raised, or one they already approved at another step. System Administrators, auditors and board viewers cannot be delegates.
      </p>
      {q.isLoading ? (
        <Panel><ListSkeleton rows={4} /></Panel>
      ) : (
        <>
          <Panel title="My delegations" subtitle="Approvals I hand to someone else">
            {mine.length ? <ul className="space-y-2">{mine.map((d) => <Row key={d.id} d={d} canEnd />)}</ul> : <EmptyState icon={Split} text="You have not delegated your approvals." />}
          </Panel>
          <Panel title="Delegated to me" subtitle="I approve on someone else's behalf">
            {toMe.length ? <ul className="space-y-2">{toMe.map((d) => <Row key={d.id} d={d} canEnd={false} />)}</ul> : <EmptyState icon={UserCheck} text="Nobody has delegated approvals to you." />}
          </Panel>
          {manageAll && (
            <Panel title="All other delegations" subtitle="Visible to administrators">
              {others.length ? <ul className="space-y-2">{others.map((d) => <Row key={d.id} d={d} canEnd />)}</ul> : <EmptyState icon={Split} text="No other delegations." />}
            </Panel>
          )}
        </>
      )}

      <FormDialog open={Boolean(form)} onClose={() => setForm(null)} icon={Split} title="Delegate my approvals" description="The delegate is notified and every approval shows that it was decided on your behalf." submitLabel="Save delegation" busy={busy} onSubmit={save}>
        {form && (
          <>
            <FormBlock icon={UserCheck} title="Who and when">
              <Field label="Delegate" required>
                <select value={form.delegate || ""} onChange={(e) => setForm({ ...form, delegate: e.target.value })} className={inputCls}>
                  <option value="">Choose a colleague…</option>
                  {candidates.map((p: any) => <option key={p.id} value={p.id}>{p.name} — {p.expand?.role?.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="First day" required><input type="date" value={form.start_date} min={today()} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputCls} /></Field>
                <Field label="Last day" required><input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Reason" required hint="e.g. annual leave, mission to the Western Province">
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={textareaCls} />
              </Field>
            </FormBlock>
            <FormBlock icon={Info} title="Which documents">
              <label className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                <input type="checkbox" checked={form.all} onChange={(e) => setForm({ ...form, all: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" />
                All documents waiting for me
              </label>
              {!form.all && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                    <label key={k} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-2 text-[13px]", form.types.includes(k) ? "border-primary bg-primary/5" : "border-slate-200")}>
                      <input type="checkbox" checked={form.types.includes(k)} onChange={(e) => setForm({ ...form, types: e.target.checked ? [...form.types, k] : form.types.filter((x: string) => x !== k) })} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      {v}
                    </label>
                  ))}
                </div>
              )}
            </FormBlock>
          </>
        )}
      </FormDialog>
    </div>
  );
}
