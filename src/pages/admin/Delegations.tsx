/**
 * Approvals → Delegations (IMS §3 rule 8): an approver on leave hands their approvals to a named
 * person for a date range. The delegate acts "on behalf of" the delegator — shown on every approval.
 * Segregation of duties still applies to the delegate (never their own documents, never twice).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { CalendarX2, Info, Plus, Split, UserCheck } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { DOCUMENT_TYPE_LABELS } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import {
  Button,
  Card,
  Checkbox,
  Column,
  DataTable,
  DatePicker,
  EmptyState,
  Field,
  Modal,
  ModalSection,
  Page,
  PageHeader,
  Person,
  Select,
  StatusPill,
  Tabs,
  Textarea,
  checkboxClass,
  fmtDate,
} from "@/components/ims";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
/** Glossary word for a delegation: Active while it runs, Inactive before it starts, Closed after. */
function state(d: any): { word: "Active" | "Inactive" | "Closed"; note: string; ended: boolean } {
  const now = new Date().toISOString().replace("T", " ");
  if (!d.active) return { word: "Closed", note: d.cancelled_at ? "Ended early" : "Ended", ended: true };
  if (d.start_date > now) return { word: "Inactive", note: `Starts ${fmtDate(d.start_date)}`, ended: false };
  if (d.end_date < now) return { word: "Closed", note: "Ended", ended: true };
  return { word: "Active", note: `Until ${fmtDate(d.end_date)}`, ended: false };
}
type TabKey = "mine" | "toMe" | "others";

export default function Delegations() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const manageAll = can("manage_delegations");
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("mine");

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
    setTried(true);
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

  const tabs = [
    { key: "mine", label: "My delegations", count: q.data ? mine.length : undefined },
    { key: "toMe", label: "Delegated to me", count: q.data ? toMe.length : undefined },
    ...(manageAll ? [{ key: "others", label: "All other delegations", count: q.data ? others.length : undefined }] : []),
  ];
  const rows = tab === "toMe" ? toMe : tab === "others" ? others : mine;
  const canEnd = tab !== "toMe";

  const columns: Column<any>[] = [
    { key: "from", header: "From", className: "max-w-[220px]", cell: (d) => <Person name={d.expand?.delegator?.name} detail="Hands over" /> },
    { key: "to", header: "To", className: "max-w-[220px]", cell: (d) => <Person name={d.expand?.delegate?.name} detail="Decides on their behalf" /> },
    {
      key: "documents",
      header: "Documents",
      clamp: true,
      cell: (d) => {
        const types: string[] = d.document_types || [];
        return types.length ? types.map((t) => DOCUMENT_TYPE_LABELS[t] || t).join(", ") : "All documents";
      },
      sub: (d) => d.reason,
    },
    { key: "dates", header: "Dates", nowrap: true, cell: (d) => `${fmtDate(d.start_date)} – ${fmtDate(d.end_date)}` },
    {
      key: "status",
      header: "Status",
      cell: (d) => {
        const s = state(d);
        return <StatusPill status={s.word} sub={s.note} />;
      },
    },
  ];

  const emptyText = tab === "toMe" ? "Nobody has delegated approvals to you." : tab === "others" ? "No other delegations." : "You have not delegated your approvals. Use Delegate my approvals before you go on leave or mission.";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Approvals", to: "/dashboard/approvals" }, { label: "Delegations" }]}
        title="Delegations"
        subtitle="Going on leave or mission? Hand your approvals to a named colleague for a date range."
        primary={{ label: "Delegate my approvals", icon: Plus, onClick: () => { setTried(false); setForm({ start_date: today(), end_date: today(), all: true, types: [], reason: "" }); } }}
      />
      <p className="flex items-start gap-2 rounded-control bg-ims-info-bg px-3.5 py-2.5 text-t-small text-ims-info">
        <Info size={15} className="mt-px shrink-0" aria-hidden />
        <span>The delegate sees your pending approvals and decides “on behalf of” you. They can never approve a document they raised, or one they already approved at another step. System Administrators, auditors and board viewers cannot be delegates.</span>
      </p>
      <Card padded={false} className="overflow-hidden">
        <Tabs inset label="Delegations" tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={820}
          caption="Delegations"
          rowClassName={(d) => state(d).ended && "text-ims-muted"}
          rowActions={canEnd ? (d) => (d.active && !state(d).ended ? [{ label: "End now", icon: CalendarX2, onSelect: () => end(d) }] : []) : undefined}
          empty={<EmptyState icon={tab === "toMe" ? UserCheck : Split} text={emptyText} />}
        />
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title="Delegate my approvals"
        description="The delegate is notified and every approval shows that it was decided on your behalf."
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={busy}>Save delegation</Button>
          </>
        }
      >
        {form && (
          <>
            <ModalSection title="Who and when">
              <Field label="Delegate" required htmlFor="dl-delegate" error={tried && !form.delegate ? "Choose the colleague who decides for you." : null}>
                <Select id="dl-delegate" value={form.delegate || ""} onChange={(e) => setForm({ ...form, delegate: e.target.value })} invalid={tried && !form.delegate}>
                  <option value="">Choose a colleague…</option>
                  {candidates.map((p: any) => <option key={p.id} value={p.id}>{p.name} — {p.expand?.role?.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First day" required htmlFor="dl-start" error={tried && !form.start_date ? "Choose the first day." : null}>
                  <DatePicker id="dl-start" value={form.start_date} min={today()} onChange={(v) => setForm({ ...form, start_date: v })} invalid={tried && !form.start_date} />
                </Field>
                <Field label="Last day" required htmlFor="dl-end" error={tried && !form.end_date ? "Choose the last day." : null}>
                  <DatePicker id="dl-end" value={form.end_date} min={form.start_date} onChange={(v) => setForm({ ...form, end_date: v })} invalid={tried && !form.end_date} />
                </Field>
              </div>
              <Field label="Reason" required htmlFor="dl-reason" hint="For example annual leave, or a mission to the Western Province." error={tried && !form.reason?.trim() ? "Say why you hand over your approvals." : null}>
                <Textarea id="dl-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} invalid={tried && !form.reason?.trim()} />
              </Field>
            </ModalSection>
            <ModalSection title="Which documents">
              <Checkbox label="All documents waiting for me" checked={Boolean(form.all)} onChange={(v) => setForm({ ...form, all: v })} />
              {!form.all && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => {
                    const on = form.types.includes(k);
                    return (
                      <label key={k} className={cn("flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-t-body", on ? "border-ims-link bg-ims-info-bg text-ims-text" : "border-ims-border text-ims-body hover:bg-ims-hover")}>
                        <input type="checkbox" className={cn(checkboxClass, "mt-0")} checked={on} onChange={(e) => setForm({ ...form, types: e.target.checked ? [...form.types, k] : form.types.filter((x: string) => x !== k) })} />
                        {v}
                      </label>
                    );
                  })}
                </div>
              )}
            </ModalSection>
          </>
        )}
      </Modal>
    </Page>
  );
}
