/**
 * General ledger → Recurring journals: templates for entries that come back every month, quarter or year (rent
 * accruals, audit fees, allocations). "Generate journals due" creates one journal per occurrence that has come and
 * sends it to the Director of Finance for approval.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { Pencil, Play, Plus, Repeat } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { JournalLineInput, ledgerApi } from "@/lib/ledger";
import {
  Button, Card, Column, DataTable, DatePicker, DocNo, EmptyState, ErrorSummary, Field, FormError, Input, KpiBand, Modal, Num, Page, PageHeader, Select, StatusPill, Textarea, TwoLine, fmtDate, fmtMoneyShort, fmtNumber, notify,
} from "@/components/ims";
import LinesEditor, { emptyLine, linesTotals } from "@/components/ledger/LinesEditor";

const FREQ: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };
const today = () => new Date().toISOString().slice(0, 10);

export default function RecurringJournals() {
  const { can } = usePermissions();
  const [editing, setEditing] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState("");
  const q = useQuery(["recurring-journals"], () => pocketbase.collection("gl_recurring_journals").getFullList({ sort: "-active,next_date,name", expand: "last_journal,created_by" }));
  const rows = (q.data || []) as any[];
  const due = rows.filter((t) => t.active && t.next_date && t.next_date.slice(0, 10) <= today() && (!t.end_date || t.next_date <= t.end_date));
  const monthly = rows.filter((t) => t.active).reduce((s, t) => s + (t.frequency === "monthly" ? t.total : t.frequency === "quarterly" ? t.total / 3 : t.total / 12), 0);
  const manage = can("manage_journals");
  const generate = async (id?: string) => {
    setBusy(id || "all");
    try {
      const r = await ledgerApi.generate(id);
      if (r.created.length) notify.success(`${r.created.length} journal${r.created.length === 1 ? "" : "s"} generated and sent to the Director of Finance: ${r.created.map((c) => c.number).join(", ")}.`);
      else notify.info("Nothing is due.");
      if (r.problems.length) notify.error(r.problems.join(" "));
      q.refetch();
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const columns: Column<any>[] = [
    { key: "name", header: "Recurring journal", width: "34%", cell: (t) => <TwoLine main={t.name} sub={t.description} /> },
    { key: "frequency", header: "Frequency", nowrap: true, cell: (t) => FREQ[t.frequency] || t.frequency, sub: (t) => `on day ${t.day_of_month}` },
    { key: "next", header: "Next", nowrap: true, cell: (t) => (t.active && t.next_date ? fmtDate(t.next_date) : "—"), sub: (t) => (t.end_date ? `until ${fmtDate(t.end_date)}` : "no end date") },
    { key: "last", header: "Last journal", nowrap: true, cell: (t) => (t.expand?.last_journal ? <Link data-no-row-click className="text-ims-link hover:underline" to={`/dashboard/finance/journals/${t.last_journal}`}><DocNo value={t.expand.last_journal.number} /></Link> : "—"), sub: (t) => (t.last_generated ? fmtDate(t.last_generated) : undefined) },
    { key: "amount", header: "Amount (RWF)", numeric: true, nowrap: true, cell: (t) => <Num value={t.total} /> },
    { key: "status", header: "Status", nowrap: true, cell: (t) => <StatusPill status={t.active ? "active" : "inactive"} sub={due.includes(t) ? "Due now" : undefined} /> },
  ];
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "General ledger", to: "/dashboard/finance/journals" }, { label: "Recurring journals" }]}
        title="Recurring journals"
        subtitle="Entries that come back every month, quarter or year. Generating creates one journal per date that has come and sends it to the Director of Finance."
        // generating is the main action only when something is due
        primary={!manage ? undefined : due.length ? { label: `Generate journals due (${due.length})`, icon: Play, onClick: () => generate(), loading: busy === "all" } : { label: "New recurring journal", icon: Plus, onClick: () => setEditing({}) }}
        secondary={manage && due.length ? [{ label: "New recurring journal", icon: Plus, onClick: () => setEditing({}) }] : []}
      />
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Active templates", value: rows.filter((t) => t.active).length, sub: `${rows.length} in total` },
          { label: "Due now", value: due.length, tone: due.length ? "warning" : "default", sub: due.length ? "generate them" : "nothing to generate" },
          { label: "Monthly equivalent", value: fmtMoneyShort(monthly), sub: "quarterly and yearly spread by month" },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={manage ? (t) => setEditing(t) : undefined}
          rowActions={manage ? (t) => [
            { label: "Edit", icon: Pencil, onSelect: () => setEditing(t) },
            { label: "Generate now", icon: Play, disabled: !due.includes(t), onSelect: () => generate(t.id) },
          ] : undefined}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          minWidth={900}
          empty={<EmptyState icon={Repeat} text="No recurring journal yet. Set one up for rent, insurance or audit-fee accruals." action={manage ? <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New recurring journal</Button> : undefined} />}
        />
      </Card>
      {editing && <TemplateDialog template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); q.refetch(); }} />}
    </Page>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = React.useState({
    name: template.name || "", description: template.description || "", frequency: template.frequency || "monthly", day_of_month: template.day_of_month || 28,
    start_date: (template.start_date || "").slice(0, 10) || today(), end_date: (template.end_date || "").slice(0, 10), active: template.active !== false,
  });
  const [lines, setLines] = React.useState<JournalLineInput[]>(
    (template.lines || []).length ? template.lines.map((l: any) => ({ account: l.account, debit: l.debit || "", credit: l.credit || "", description: l.description || "", department: l.department || "", funding_source: l.funding_source || "", project: l.project || "" })) : [emptyLine(), emptyLine()]
  );
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [busy, setBusy] = React.useState(false);
  const t = linesTotals(lines);
  const save = async () => {
    const filled = lines.filter((l) => l.account && (Number(l.debit) || Number(l.credit)));
    const out: FormError[] = [];
    if (v.name.trim().length < 3) out.push({ field: "rec-name", message: "Name the recurring journal" });
    if (filled.length < 2) out.push({ message: "Add at least two lines with an account and an amount" });
    if (t.difference) out.push({ message: `Debits and credits must be equal — the difference is ${fmtNumber(Math.abs(t.difference))}` });
    setErrors(out);
    if (out.length) return;
    setBusy(true);
    try {
      const body = { ...v, day_of_month: Number(v.day_of_month), lines: filled.map((l) => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) };
      if (template.id) await ledgerApi.updateRecurring(template.id, body);
      else await ledgerApi.createRecurring(body);
      notify.success(`${v.name} saved.`);
      onSaved();
    } catch (e) {
      setErrors([{ message: errorMessage(e) }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={template.id ? `Edit ${template.name}` : "New recurring journal"}
      description="Each occurrence becomes a journal for the Director of Finance to approve; nothing is posted until then."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}
    >
      <ErrorSummary errors={errors} title="Check these before saving" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required htmlFor="rec-name"><Input id="rec-name" value={v.name} maxLength={160} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. Rent of the Huye regional office" /></Field>
        <Field label="Why" htmlFor="rec-desc"><Textarea id="rec-desc" className="min-h-[44px]" value={v.description} maxLength={500} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} placeholder="Lease, contract or policy it comes from" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Frequency" htmlFor="rec-freq"><Select id="rec-freq" value={v.frequency} onChange={(e) => setV((x) => ({ ...x, frequency: e.target.value }))}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Day of the month" htmlFor="rec-day" hint="1 to 28"><Input id="rec-day" type="number" min={1} max={28} value={v.day_of_month} onChange={(e) => setV((x) => ({ ...x, day_of_month: Number(e.target.value) }))} /></Field>
        <Field label="From" required htmlFor="rec-start"><DatePicker id="rec-start" value={v.start_date} onChange={(d) => setV((x) => ({ ...x, start_date: d }))} /></Field>
        <Field label="Until" htmlFor="rec-end" hint="Leave empty for no end"><DatePicker id="rec-end" value={v.end_date} min={v.start_date} onChange={(d) => setV((x) => ({ ...x, end_date: d }))} placeholder="No end date" /></Field>
      </div>
      <LinesEditor lines={lines} onChange={setLines} />
      <label className="flex items-center gap-2 text-t-body"><input type="checkbox" className="h-4 w-4" checked={v.active} onChange={(e) => setV((x) => ({ ...x, active: e.target.checked }))} /> Active — generate it when due</label>
    </Modal>
  );
}
