/**
 * /dashboard/ui-kit — every shared component and state of the RALGA IMS UI kit, with the tokens.
 * Reference for anyone building a page; the data below is illustrative and nothing is saved.
 */
import * as React from "react";
import { CheckCircle2, ClipboardList, Download, FilePlus2, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import tokens from "@/design/tokens.json";
import ExportMenu from "@/components/enterprise/ExportMenu";
import {
  Button, Card, CardHeader, Column, ConfirmDialog, DataTable, DatePicker, DetailHeader, Details, DocNo, EmptyState, ErrorState, ErrorSummary, Field,
  FilterBar, FilterSelect, DateRangeFilter, FormActions, FormBody, FormSection, GLOSSARY, Input, KpiBand, Modal, MoneyInput, Num, Page, PageHeader, Pager,
  Person, Priority, Select, StatusPill, SummaryPanel, Tabs, Textarea, TwoLine, statusWord, fmtDate, fmtDateTime, fmtMoney, fmtMoneyShort, fmtNumber, fmtWhen, notify, overdue,
} from "@/components/ims";

type Req = { id: string; number: string; title: string; category: string; requester: string; department: string; amount: number; status: string; with: string; priority: string; date: string };

const ROWS: Req[] = [
  { id: "1", number: "PR-2026-000031", title: "Laptops for the ICT and Digital Services unit (replacement of 2019 devices)", category: "ICT equipment", requester: "Aline Mukamana", department: "Capacity Building", amount: 7_250_000, status: "pending_approval", with: "Director of Finance", priority: "urgent", date: "2026-11-25" },
  { id: "2", number: "PR-2026-000030", title: "Venue and catering for the district budget hearings", category: "Events", requester: "David Uwimana", department: "Advocacy, Policy and Research", amount: 3_480_000, status: "approved", with: "Procurement Officer", priority: "high", date: "2026-11-22" },
  { id: "3", number: "PR-2026-000029", title: "Office stationery, quarter 2", category: "Stationery", requester: "Denise Tuyishime", department: "Finance and Administration", amount: 612_500, status: "returned", with: "Denise Tuyishime", priority: "medium", date: "2026-11-18" },
  { id: "4", number: "PR-2026-000027", title: "Vehicle tyres for RAC 214 B", category: "Fleet", requester: "Fabrice Ndayisaba", department: "Office of the Secretary General", amount: 1_920_000, status: "converted_to_po", with: "—", priority: "low", date: "2026-11-10" },
];

const COLUMNS: Column<Req>[] = [
  { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
  { key: "title", header: "Title", sortField: "title", clamp: true, cell: (r) => r.title, sub: (r) => r.category },
  { key: "requester", header: "Requester", cell: (r) => <Person name={r.requester} detail={r.department} /> },
  { key: "priority", header: "Priority", cell: (r) => <Priority value={r.priority} /> },
  { key: "amount", header: "Total (RWF)", numeric: true, sortField: "amount", cell: (r) => <Num value={r.amount} />, total: <Num value={ROWS.reduce((s, r) => s + r.amount, 0)} /> },
  { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
  { key: "with", header: "With", cell: (r) => r.with },
  { key: "date", header: "Requested", nowrap: true, sortField: "date", cell: (r) => fmtDate(r.date) },
];

function Section({ id, title, children, note }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-3">
      <div className="border-b border-ims-border pb-2">
        <h2 className="text-t-section text-ims-text">{title}</h2>
        {note && <p className="text-t-small text-ims-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function UiKit() {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("pending_approval");
  const [dept, setDept] = React.useState("");
  const [range, setRange] = React.useState<[string, string]>(["2026-11-01", ""]);
  const [sort, setSort] = React.useState("-date");
  const [page, setPage] = React.useState(1);
  const [per, setPer] = React.useState(15);
  const [tableState, setTableState] = React.useState<"rows" | "loading" | "empty" | "error">("rows");
  const [amount, setAmount] = React.useState<number | "">(1250000);
  const [date, setDate] = React.useState("2026-11-25");
  const [title, setTitle] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [modal, setModal] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const titleError = submitted && !title.trim() ? "Enter a title of at least 5 characters, e.g. “Laptops for the ICT unit”." : null;
  const amountError = submitted && !(Number(amount) > 0) ? "Enter an amount above 0." : null;

  const chips = [
    ...(status ? [{ key: "status", label: `Status: ${statusWord(status) || status}`, onRemove: () => setStatus("") }] : []),
    ...(dept ? [{ key: "dept", label: `Department: ${dept}`, onRemove: () => setDept("") }] : []),
    ...(range[0] || range[1] ? [{ key: "range", label: `Requested: ${range[0] ? fmtDate(range[0]) : "…"} – ${range[1] ? fmtDate(range[1]) : "…"}`, onRemove: () => setRange(["", ""]) }] : []),
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "UI kit" }]}
        title="UI kit"
        subtitle="Every shared component, its states and the design tokens. Build pages from these only."
        secondary={[{ label: "Show a toast", icon: CheckCircle2, onClick: () => notify.success("PR-2026-000031 sent to the Director of Finance.") }]}
        primary={{ label: "New requisition", icon: Plus, onClick: () => notify.info("Primary action: one per page.") }}
      />

      <nav aria-label="Contents" className="flex flex-wrap gap-x-4 gap-y-1 text-t-small font-semibold">
        {["tokens", "buttons", "status", "list", "kpi", "detail", "forms", "dialogs", "feedback", "writing"].map((s) => (
          <a key={s} href={`#${s}`} className="text-ims-link hover:underline">{s.charAt(0).toUpperCase() + s.slice(1)}</a>
        ))}
      </nav>

      <Section id="tokens" title="Tokens" note="From src/design/tokens.json — pages never hard-code colours or sizes.">
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Object.entries(tokens.color).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="h-10 rounded-control border border-ims-border" style={{ background: v }} />
                <p className="mt-1 truncate text-t-small font-semibold text-ims-text">{k}</p>
                <p className="font-mono text-[11.5px] text-ims-muted">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2 border-t border-ims-divider pt-4">
            <p className="text-t-title">Page title 28/800</p>
            <p className="text-t-section">Section title 17/800</p>
            <p className="text-t-body">Body 14 — numbers use tabular figures: 1,250,000 · 612,500</p>
            <p className="text-t-subtitle text-ims-muted">Page subtitle 14 muted</p>
            <p className="text-t-small text-ims-muted">Small 12.5 muted</p>
            <p className="text-t-kpi">22/800 KPI value</p>
          </div>
        </Card>
      </Section>

      <Section id="buttons" title="Buttons" note="Primary navy (one per page or section) · secondary · danger (with a confirmation) · link. 40px, icon + text, verb first.">
        <Card className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={Send}>Submit for approval</Button>
          <Button icon={FilePlus2}>Save draft</Button>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>Reject</Button>
          <Button variant="link">View history</Button>
          <Button variant="primary" loading>Sending</Button>
          <Button disabled>Not available</Button>
          <Button size="icon" aria-label="Edit"><Pencil size={16} /></Button>
          <Button size="sm" icon={Download}>Small</Button>
        </Card>
      </Section>

      <Section id="status" title="Status glossary and priority" note="Every module maps its statuses to these words. Detail goes on a second line.">
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.keys(GLOSSARY).map((w) => <StatusPill key={w} status={w} />)}
          </div>
          <div className="flex flex-wrap gap-6">
            <StatusPill status="approved" sub="With the Procurement Officer" />
            <StatusPill status="paid" sub={`Paid ${fmtDate("2026-11-25")}`} />
            <StatusPill status="returned" sub="Correct and send again" />
          </div>
          <div className="flex flex-wrap gap-6">
            {["urgent", "high", "medium", "low"].map((p) => <Priority key={p} value={p} />)}
          </div>
        </Card>
      </Section>

      <Section id="list" title="List page: tabs, filter bar, table, pager" note="Header sentence case; a line between columns; money header with the unit and a total row; a With column on approval tables.">
        <div className="flex flex-wrap gap-2 text-t-small">
          <span className="font-semibold text-ims-muted">Table state:</span>
          {(["rows", "loading", "empty", "error"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setTableState(s)} className={tableState === s ? "font-bold text-ims-primary underline" : "text-ims-link hover:underline"}>{s}</button>
          ))}
        </div>
        <Card padded={false} className="overflow-hidden">
          <Tabs inset active={tab} onChange={setTab} tabs={[{ key: "all", label: "All requisitions", count: 30 }, { key: "mine", label: "My requisitions", count: 4 }, { key: "awaiting", label: "Awaiting my approval", count: 3 }]} />
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: "Search number, title or requester" }}
            chips={chips}
            onClear={() => { setStatus(""); setDept(""); setRange(["", ""]); }}
            right={<ExportMenu onExport={() => { notify.info("Exports the rows you can see, with the RALGA header."); }} />}
          >
            <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "pending_approval", label: "Pending approval" }, { value: "approved", label: "Approved" }, { value: "returned", label: "Returned" }]} />
            <FilterSelect label="Department" value={dept} onChange={setDept} options={[{ value: "Finance and Administration", label: "Finance and Administration" }, { value: "Capacity Building", label: "Capacity Building" }]} />
            <DateRangeFilter label="Requested" from={range[0]} to={range[1]} onChange={(a, b) => setRange([a, b])} />
          </FilterBar>
          <DataTable
            columns={COLUMNS}
            rows={tableState === "rows" ? ROWS : []}
            rowKey={(r) => r.id}
            onRowClick={(r) => notify.info(`Opens ${r.number}.`)}
            rowActions={(r) => [
              { label: "Open", icon: ClipboardList, onSelect: () => notify.info(`Opens ${r.number}.`) },
              { label: "Return for changes", icon: Undo2, onSelect: () => setConfirm(true) },
              { label: "Delete draft", icon: Trash2, danger: true, disabled: r.status !== "draft", onSelect: () => undefined },
            ]}
            sort={sort}
            onSort={setSort}
            loading={tableState === "loading"}
            error={tableState === "error" ? new Error("The server did not answer. Check your connection.") : undefined}
            onRetry={() => setTableState("rows")}
            empty={<EmptyState icon={ClipboardList} text="No requisitions yet. Create one with New requisition." action={<Button variant="primary" icon={Plus}>New requisition</Button>} />}
            footer={<Pager page={page} perPage={per} total={30} onPage={setPage} onPerPage={setPer} />}
          />
        </Card>
      </Section>

      <Section id="kpi" title="KPI band and cards" note="One white card split by thin dividers; 4–6 small numbers; no icons in circles.">
        <KpiBand
          items={[
            { label: "Open requisitions", value: 12, sub: "4 waiting for you" },
            { label: "Committed", value: fmtMoneyShort(48_250_000), sub: "on approved orders" },
            { label: "Late deliveries", value: 2, tone: "danger", sub: "past the expected date" },
            { label: "Average approval time", value: "1.8 days", sub: "last 30 days" },
            { label: "Budget used", value: "62%", tone: "warning", sub: "FY 2026/27" },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Approval queue" subtitle="Oldest first" link={{ to: "#list", label: "View all" }} />
            <p className="text-t-body text-ims-body">Card body: border only, radius 14px, padding 20px.</p>
          </Card>
          <Card>
            <CardHeader title="One-third card" />
            <p className="text-t-body text-ims-body">Dashboards use a 2/3 + 1/3 grid.</p>
          </Card>
        </div>
      </Section>

      <Section id="detail" title="Detail page header" note="Back link · number · type · status · title · key facts · next step on the right.">
        <Card className="space-y-5">
          <DetailHeader
            back={{ label: "Back to requisitions", to: "#list" }}
            number="PR-2026-000031"
            type="Purchase requisition"
            status="pending_approval"
            statusNote="With the Director of Finance · Overdue · 2 days"
            title="Laptops for the ICT and Digital Services unit"
            facts={[{ label: "Requested by", value: "Aline Mukamana" }, "Capacity Building", fmtDate("2026-11-25"), <b key="a" className="tabular-nums">{fmtMoney(7_250_000)}</b>]}
            actions={<><Button icon={Undo2} onClick={() => setConfirm(true)}>Return</Button><Button variant="primary" icon={CheckCircle2}>Approve</Button></>}
          />
          <Tabs active="details" onChange={() => undefined} tabs={[{ key: "details", label: "Details" }, { key: "items", label: "Items", count: 3 }, { key: "approvals", label: "Approvals" }, { key: "documents", label: "Documents", count: 2 }, { key: "activity", label: "Activity" }]} />
          <Details items={[
            { label: "Department", value: "Capacity Building" },
            { label: "Budget line", value: "2.1.3 ICT equipment", hint: "RWF 12,400,000 available" },
            { label: "Needed by", value: fmtDate("2026-12-10") },
            { label: "Funding source", value: "Government of Rwanda" },
            { label: "Justification", value: "The 2019 laptops no longer run the accounting software.", wide: true },
          ]} />
        </Card>
      </Section>

      <Section id="forms" title="Form page" note="Label above · red * when required · hint under · error says how to fix · numbered sections · summary with checklist.">
        <ErrorSummary errors={[...(titleError ? [{ field: "kit-title", message: titleError }] : []), ...(amountError ? [{ field: "kit-amount", message: amountError }] : [])]} />
        <FormBody
          aside={<SummaryPanel rows={[["Items", "3"], ["Total", fmtMoney(Number(amount) || 0)]]} checklist={[{ label: "Title", done: Boolean(title.trim()) }, { label: "Amount above 0", done: Number(amount) > 0 }, { label: "At least one quote attached", done: false }]} />}
        >
          <FormSection title="Details" description="What you need and why.">
            <Field label="Title" required htmlFor="kit-title" hint="A short name a colleague would recognise." error={titleError}>
              <Input id="kit-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={Boolean(titleError)} placeholder="Laptops for the ICT unit" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated amount" required htmlFor="kit-amount" error={amountError}>
                <MoneyInput id="kit-amount" value={amount} onChange={setAmount} invalid={Boolean(amountError)} />
              </Field>
              <Field label="Needed by" htmlFor="kit-date" hint={`Shows as ${fmtDate(date)}.`}>
                <DatePicker id="kit-date" value={date} onChange={setDate} />
              </Field>
            </div>
            <Field label="Category" htmlFor="kit-cat">
              <Select id="kit-cat" defaultValue="ict"><option value="ict">ICT equipment</option><option value="events">Events</option></Select>
            </Field>
          </FormSection>
          <FormSection title="Justification">
            <Field label="Why is this needed?" htmlFor="kit-why"><Textarea id="kit-why" placeholder="Explain the need in two or three sentences." /></Field>
          </FormSection>
        </FormBody>
        <FormActions onSubmit={() => setSubmitted(true)} onSaveDraft={() => notify.success("Draft saved.")} onCancel={() => setSubmitted(false)} note="Draft saved automatically at 14:30." />
      </Section>

      <Section id="dialogs" title="Dialogs and toasts" note="The title is a question; one line on what happens; Cancel + the action word.">
        <Card className="flex flex-wrap gap-3">
          <Button onClick={() => setModal(true)}>Open a dialog</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Reject with a reason</Button>
          <Button onClick={() => notify.success("PR-2026-000031 sent to the Director of Finance.")}>Success toast</Button>
          <Button onClick={() => notify.error("The file is larger than 10 MB. Choose a smaller file.")}>Error toast</Button>
        </Card>
      </Section>

      <Section id="feedback" title="Empty and error states">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><EmptyState icon={ClipboardList} text="No requisitions yet. Create one with New requisition." action={<Button variant="primary" icon={Plus}>New requisition</Button>} /></Card>
          <Card><ErrorState detail="The server did not answer. Check your connection." onRetry={() => notify.info("Retrying.")} /></Card>
        </div>
      </Section>

      <Section id="writing" title="Writing rules" note="Sentence case, plain words, no “Please”, no exclamation marks.">
        <Card>
          <Details columns={3} items={[
            { label: "Date", value: fmtDate("2026-11-25") },
            { label: "Date and time", value: fmtDateTime("2026-11-25T14:30:00") },
            { label: "Recent (under 7 days)", value: fmtWhen(new Date(Date.now() - 2 * 86_400_000)) },
            { label: "Overdue", value: <span className="font-semibold text-ims-danger">{overdue(new Date(Date.now() - 2 * 86_400_000))}</span> },
            { label: "Money in text", value: fmtMoney(1_250_000) },
            { label: "Money in tables", value: <span>header “Total (RWF)”, cell {fmtNumber(1_250_000)}</span> },
            { label: "People", value: <Person name="Aline Mukamana" detail="Capacity Building" /> },
            { label: "Document number", value: <DocNo value="LV-2026-000012" /> },
            { label: "Title with category", value: <TwoLine main="Venue and catering for the district budget hearings" sub="Events" /> },
          ]} />
        </Card>
      </Section>

      <Modal open={modal} onClose={() => setModal(false)} title="Add a supplier quote" description="Attach the quote and enter its total." footer={<><Button onClick={() => setModal(false)}>Cancel</Button><Button variant="primary" onClick={() => setModal(false)}>Add quote</Button></>}>
        <Field label="Total" required htmlFor="kit-quote"><MoneyInput id="kit-quote" value={""} onChange={() => undefined} /></Field>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reject this requisition?"
        description="Aline Mukamana is told why, and the requisition cannot be sent again."
        confirmLabel="Reject"
        danger
        reason={{ label: "Reason for rejecting", required: true, min: 10 }}
        onConfirm={() => notify.success("PR-2026-000031 rejected. Aline Mukamana has been told.")}
      />
    </Page>
  );
}

