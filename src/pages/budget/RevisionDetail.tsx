/**
 * Budget revision: choose the type, the lines and the change per line (or the new monthly spread for
 * a re-phasing), save as draft, submit. Decreases never go below what is already committed or spent;
 * a virement must net to zero. On final approval the lines are updated and the change is audited.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, Clock, CornerUpLeft, GitCompareArrows, Plus, Save, Send, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { BudgetLineUsage, MONTHS_FY, REVISION_TYPES, budgetApi } from "@/lib/budget";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { ChoiceCards } from "@/components/portal/kit";
import DocumentUploads from "@/components/enterprise/Attachments";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  KpiBand,
  MenuItem,
  MoreMenu,
  Num,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  Tabs,
  Textarea,
  fmtDate,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { cn } from "@/utils";
import { REVISION_STATUS, Signed } from "./BudgetRevisions";

type Row = { budget_line: string; change: number | string; phasing?: (number | string)[] };
const EDITABLE = ["draft", "returned"];
const LIST = "/dashboard/budget/revisions";
const num = (v: unknown) => Math.round(Number(v) || 0);
/** "RWF +1,000,000" / "RWF −1,000,000" in sentences and summaries. */
const signedMoney = (n: number) => `RWF ${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtNumber(Math.abs(n))}`;

export default function RevisionDetail() {
  const { revisionId } = useParams();
  const isNew = revisionId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState("details");
  const [form, setForm] = React.useState<{ type: string; title: string; reason: string; lines: Row[] } | null>(isNew ? { type: "virement", title: "", reason: "", lines: [] } : null);
  const [busy, setBusy] = React.useState<"submit" | "draft" | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [tried, setTried] = React.useState(false);

  const doc = useQuery(["budget-revision", revisionId], () => pocketbase.collection("budget_revisions").getOne(revisionId!, { expand: "fiscal_year,prepared_by,approval" }), { enabled: !isNew });
  const r: any = doc.data;
  const usage = useQuery(["budget-usage-rev", r?.fiscal_year || "current"], () => budgetApi.usage(r?.fiscal_year ? { fiscal_year: r.fiscal_year } : {}), { enabled: isNew || Boolean(r) });
  const trail = useApprovalTrail("budget_revision", "budget_revisions", isNew ? undefined : revisionId);
  const byId = React.useMemo(() => Object.fromEntries((usage.data?.items || []).map((i) => [i.id, i])), [usage.data]) as Record<string, BudgetLineUsage>;
  const editable = can("manage_budgets") && (isNew || (r && EDITABLE.includes(r.status)));

  React.useEffect(() => {
    if (r && !form && EDITABLE.includes(r.status)) setForm({ type: r.type, title: r.title, reason: r.reason || "", lines: (r.lines || []).map((l: any) => ({ budget_line: l.budget_line, change: l.change, phasing: l.phasing })) });
  }, [r, form]);

  const refresh = () => {
    queryClient.invalidateQueries(["budget-revision", revisionId]);
    queryClient.invalidateQueries(["budget-usage-rev"]);
    trail.refresh();
  };

  const rows: Row[] = editable && form ? form.lines : (r?.lines || []);
  const type = (editable && form ? form.type : r?.type) || "virement";
  const inc = rows.reduce((a, l) => a + Math.max(num(l.change), 0), 0);
  const dec = rows.reduce((a, l) => a + Math.max(-num(l.change), 0), 0);
  const problems = rows.flatMap((l) => {
    const f = byId[l.budget_line];
    const c = num(l.change);
    if (!l.budget_line) return ["Choose a line on every row."];
    if (f && c < 0 && f.budget + c < f.committed + f.actual) return [`${f.code}: cannot reduce below committed + spent (${fmtMoney(f.committed + f.actual)}).`];
    if (type === "rephasing" && f) {
      const ph = (l.phasing || []).map(num);
      if (ph.length !== 12 || ph.reduce((a, v) => a + v, 0) !== f.budget) return [`${f.code}: the months must add up to ${fmtMoney(f.budget)}.`];
    }
    return [];
  });
  if (type === "virement" && rows.length && inc !== dec) problems.push(`Increases (${fmtMoney(inc)}) must equal decreases (${fmtMoney(dec)}).`);
  if (type === "supplementary" && rows.some((l) => num(l.change) <= 0)) problems.push("A supplementary budget only increases lines.");
  if (type === "reduction" && rows.some((l) => num(l.change) >= 0)) problems.push("A reduction only decreases lines.");

  const setLine = (i: number, patch: Partial<Row>) => form && setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  function payload() {
    return {
      type: form!.type, title: form!.title.trim(), reason: form!.reason.trim(),
      lines: form!.lines.map((l) => ({ budget_line: l.budget_line, change: form!.type === "rephasing" ? 0 : num(l.change), ...(form!.type === "rephasing" ? { phasing: (l.phasing || []).map(num) } : {}) })),
    };
  }

  async function save(thenSubmit = false) {
    if (!form?.title.trim()) return toast.error("Give the revision a title.");
    setBusy(thenSubmit ? "submit" : "draft");
    try {
      const saved = isNew ? await pocketbase.collection("budget_revisions").create(payload()) : await pocketbase.collection("budget_revisions").update(r.id, payload());
      if (thenSubmit) {
        await budgetApi.revisionAction(saved.id, "submit");
        toast.success(`${saved.number} submitted for approval`);
      } else toast.success(`${saved.number} saved as draft`);
      if (isNew) navigate(`/dashboard/budget/revisions/${saved.id}`, { replace: true });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(reason: string) {
    try {
      await budgetApi.revisionAction(r.id, "cancel", reason.trim());
      toast.success(`${r.number} cancelled`);
      setCancelOpen(false);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  if (!isNew && doc.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!isNew && !r) {
    return (
      <Page>
        <Card>
          <EmptyState icon={GitCompareArrows} text="This revision is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to revisions</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const number = isNew ? "New revision" : r.number;
  const options = (usage.data?.items || []).filter((i) => !rows.some((l) => l.budget_line === i.id));
  const approval: any = r?.expand?.approval;
  const isApprover = approval?.status === "pending" && String(approval.pending_approvers || "").split(",").includes(me?.id);
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const returnNote = [...trail.actions].reverse().find((a: any) => a.action === "return")?.comment;
  const fyName = usage.data?.fiscal_year?.name || r?.expand?.fiscal_year?.name || "";
  const rephasing = type === "rephasing";

  // Submitting needs at least one line and no open problem (the title is checked when saving).
  const canSubmit = rows.length > 0 && problems.length === 0;
  const errors: FormError[] = tried && editable && form ? [
    ...(!form.title.trim() ? [{ field: "rev-title", message: "Give the revision a title." }] : []),
    ...(!rows.length ? [{ message: "Add at least one line this revision changes." }] : []),
    ...[...new Set(problems)].map((p) => ({ message: p })),
  ] : [];
  const submit = () => {
    setTried(true);
    if (canSubmit) save(true);
  };

  // ------------------------------------------------------------------ lines table (editable or read-only)
  const sumCurrent = rows.reduce((a, l) => a + (byId[l.budget_line] ? byId[l.budget_line].budget : (l as any).current || 0), 0);
  const lineColumns: Column<Row>[] = [
    {
      key: "line",
      header: "Budget line",
      className: editable ? "min-w-[220px] max-w-[300px]" : "min-w-[260px] max-w-[340px]",
      cell: (l, i) => {
        const f = byId[l.budget_line];
        if (editable && !l.budget_line) {
          return (
            <Select value="" onChange={(e) => setLine(i, { budget_line: e.target.value, phasing: rephasing ? byId[e.target.value]?.phasing : undefined })} aria-label="Budget line" className="h-9">
              <option value="">Choose the line…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.account} ({fmtMoney(o.available)} available)</option>)}
            </Select>
          );
        }
        return <DocNo value={f?.code || (l as any).code} className="font-semibold text-ims-text" />;
      },
      sub: (l) => {
        const f = byId[l.budget_line];
        if (!l.budget_line) return null;
        const where = f ? `${f.account} · ${f.department_name} · ${f.funding_code}${f.project_code ? ` · ${f.project_code}` : ""}` : (l as any).name;
        // In the form the table is narrow: what is used and available goes under the line.
        if (!editable || !f) return where;
        return (
          <>
            <span className="block truncate" title={where}>{where}</span>
            <span className="block">Committed + spent {fmtMoney(f.committed + f.actual)} · available {fmtMoney(f.available)}</span>
          </>
        );
      },
    },
    {
      key: "current",
      header: "Current budget (RWF)",
      numeric: true,
      cell: (l) => <Num value={byId[l.budget_line] ? byId[l.budget_line].budget : (l as any).current || 0} />,
      total: rephasing ? undefined : <Num value={sumCurrent} />,
    },
    ...(editable ? [] : ([
      { key: "used", header: "Committed + spent (RWF)", numeric: true, cell: (l) => (byId[l.budget_line] ? <Num value={byId[l.budget_line].committed + byId[l.budget_line].actual} /> : "—") },
      { key: "available", header: "Available (RWF)", numeric: true, cell: (l) => (byId[l.budget_line] ? <Num value={byId[l.budget_line].available} negativeRed /> : "—") },
    ] as Column<Row>[])),
    {
      key: "change",
      header: rephasing ? "Annual, unchanged (RWF)" : "Change (RWF)",
      numeric: true,
      cell: (l, i) => {
        const f = byId[l.budget_line];
        const current = f ? f.budget : (l as any).current || 0;
        const c = rephasing ? 0 : num(l.change);
        const tooLow = f && c < 0 && current + c < f.committed + f.actual;
        if (rephasing) return <span className="text-ims-muted"><Num value={current} /></span>;
        if (editable) {
          return (
            <Input
              type="number"
              step={1000}
              value={l.change}
              onChange={(e) => setLine(i, { change: e.target.value })}
              invalid={Boolean(tooLow)}
              className="ml-auto h-9 w-36 text-right tabular-nums"
              aria-label={`Change to ${f?.code || "this line"} in RWF (negative to decrease)`}
            />
          );
        }
        return <span className="font-semibold"><Signed value={c} /></span>;
      },
      total: rephasing ? undefined : <Signed value={inc - dec} />,
    },
    {
      key: "new",
      header: "New budget (RWF)",
      numeric: true,
      cell: (l) => {
        const f = byId[l.budget_line];
        const current = f ? f.budget : (l as any).current || 0;
        const c = rephasing ? 0 : num(l.change);
        const tooLow = f && c < 0 && current + c < f.committed + f.actual;
        return <span className={cn("font-semibold", tooLow && "text-ims-danger")}><Num value={current + c} /></span>;
      },
      total: rephasing ? undefined : <Num value={sumCurrent + inc - dec} />,
    },
    ...(editable
      ? [{
          key: "remove",
          header: <span className="sr-only">Remove</span>,
          width: "56px",
          align: "center" as const,
          cell: (_: Row, i: number) => (
            <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Remove line" className="hover:bg-ims-danger-bg hover:text-ims-danger" onClick={() => setForm({ ...form!, lines: form!.lines.filter((_, j) => j !== i) })} />
          ),
        } as Column<Row>]
      : []),
  ];

  const linesTable = (
    <DataTable
      columns={lineColumns}
      rows={rows}
      rowKey={(_, i) => String(i)}
      loading={usage.isLoading}
      totalLabel={`Increases ${fmtMoney(inc)} · decreases ${fmtMoney(dec)}`}
      minWidth={editable ? 720 : 900}
      caption="Lines this revision changes"
      empty={<EmptyState compact icon={GitCompareArrows} text={editable ? "No lines yet. Add the lines this revision changes." : "No lines on this revision."} />}
    />
  );

  /** New monthly spread of each line (re-phasing). */
  const spread = rephasing && rows.some((l) => l.budget_line || l.phasing) ? (
    editable ? (
      <div className="space-y-4 border-t border-ims-divider px-5 py-4">
        <div>
          <h3 className="text-t-label text-ims-text">New monthly spread</h3>
          <p className="mt-0.5 text-t-small text-ims-muted">July to June, in RWF. The months of each line must add up to its annual budget.</p>
        </div>
        {rows.map((l, i) => {
          if (!(l.budget_line || l.phasing)) return null;
          const f = byId[l.budget_line];
          const total = (l.phasing || []).reduce((a: number, v) => a + num(v), 0);
          return (
            <div key={i} className="rounded-control border border-ims-border p-3">
              <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <DocNo value={f?.code || (l as any).code} className="font-semibold text-ims-text" />
                {f && <span className={cn("text-t-small", total === f.budget ? "text-ims-success" : "text-ims-danger")}>Months total {fmtMoney(total)} of {fmtMoney(f.budget)}</span>}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
                {MONTHS_FY.map((m, k) => (
                  <div key={m} className="min-w-0">
                    <label htmlFor={`rev-${i}-m${k}`} className="mb-1 block text-t-small font-semibold text-ims-muted">{m}</label>
                    <Input
                      id={`rev-${i}-m${k}`}
                      type="number"
                      min={0}
                      value={(l.phasing || [])[k] ?? 0}
                      onChange={(e) => setLine(i, { phasing: Array.from({ length: 12 }, (_, z) => (z === k ? e.target.value : (l.phasing || [])[z] ?? 0)) })}
                      className="h-9 px-2 text-right text-t-small tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="border-t border-ims-divider">
        <div className="px-5 pt-4">
          <CardHeader title="New monthly spread" subtitle="July to June, in RWF." />
        </div>
        <DataTable
          columns={[
            { key: "line", header: "Line", nowrap: true, cell: (l: Row) => <DocNo value={byId[l.budget_line]?.code || (l as any).code} className="font-semibold text-ims-text" /> },
            ...MONTHS_FY.map((m, k) => ({ key: m, header: m, numeric: true, cell: (l: Row) => <Num value={num((l.phasing || [])[k])} /> })),
            { key: "year", header: "Year (RWF)", numeric: true, className: "font-semibold", cell: (l: Row) => <Num value={(l.phasing || []).reduce((a: number, v) => a + num(v), 0)} /> },
          ]}
          rows={rows}
          rowKey={(_, i) => String(i)}
          minWidth={1500}
          caption="New monthly spread"
        />
      </div>
    )
  ) : null;

  // ------------------------------------------------------------------ the form (new, draft or returned)
  const formBody = editable && form ? (
    <FormBody
      aside={
        <SummaryPanel
          title="Summary"
          rows={[
            ["Type", REVISION_TYPES[form.type]?.label || form.type],
            ["Lines", fmtNumber(rows.length)],
            ...(rephasing ? [] : ([["Increases", fmtMoney(inc)], ["Decreases", fmtMoney(dec)], ["Net change", signedMoney(inc - dec)]] as [string, React.ReactNode][])),
          ]}
          checklist={[
            { label: "Title given", done: Boolean(form.title.trim()) },
            { label: "Reason written (10 characters or more)", done: form.reason.trim().length >= 10 },
            { label: "At least one line", done: rows.length > 0 },
            ...(form.type === "virement" ? [{ label: "Increases equal decreases", done: rows.length > 0 && inc === dec }] : []),
            { label: "Every line can take the change", done: rows.length > 0 && problems.length === 0 },
          ]}
        >
          {rows.length > 0 && (problems.length ? (
            <ul className="mt-4 space-y-1.5 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2.5 text-t-small text-ims-warning">
              {[...new Set(problems)].map((p) => <li key={p} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {p}</li>)}
            </ul>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 text-t-small font-semibold text-ims-success"><CheckCircle2 size={15} aria-hidden /> Ready to submit.</p>
          ))}
        </SummaryPanel>
      }
    >
      <FormSection title="Revision" description={fyName ? `Changes approved lines of ${fyName}.` : undefined}>
        <Field label="Type" required>
          <ChoiceCards
            columns={4}
            value={form.type}
            onChange={(t) => setForm({ ...form, type: t, lines: form.lines.map((l) => ({ ...l, phasing: t === "rephasing" ? l.phasing || byId[l.budget_line]?.phasing : undefined })) })}
            options={Object.entries(REVISION_TYPES).map(([value, t]) => ({ value, label: t.label, description: t.hint }))}
          />
        </Field>
        <Field label="Title" required htmlFor="rev-title" error={tried && !form.title.trim() ? "Give the revision a title, for example “Virement to cover printing of the annual report”." : null}>
          <Input id="rev-title" value={form.title} invalid={tried && !form.title.trim()} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Virement to cover printing of the annual report" />
        </Field>
        <Field label="Reason" required htmlFor="rev-reason" hint="At least 10 characters. The approvers read this.">
          <Textarea id="rev-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="min-h-[88px]" />
        </Field>
      </FormSection>
      <section className="rounded-card border border-ims-border bg-ims-card [counter-increment:ims-section]">
        <div className="px-5 pt-5">
          <CardHeader
            title={<><span className="before:content-[counter(ims-section)]" /><span className="px-1.5 text-ims-faint">·</span>Lines</>}
            subtitle={rephasing ? "The lines to re-spread over the months. Their annual budget does not change." : "The change per line in RWF: positive to increase, negative to decrease."}
            action={<Button size="sm" icon={Plus} onClick={() => setForm({ ...form!, lines: [...form!.lines, { budget_line: "", change: "" }] })} disabled={!options.length}>Add a line</Button>}
          />
        </div>
        {linesTable}
        {spread}
      </section>
    </FormBody>
  ) : null;

  const more: MenuItem[] = [
    { label: "Cancel revision", icon: Ban, danger: true, onSelect: () => setCancelOpen(true), hidden: !(!isNew && can("manage_budgets") && ["draft", "returned", "pending_approval"].includes(r?.status)) },
  ];

  if (isNew) {
    return (
      <Page>
        <PageHeader
          breadcrumbs={[{ label: "Budget", to: "/dashboard/budget" }, { label: "Budget revisions", to: LIST }, { label: "New revision" }]}
          title="New budget revision"
          subtitle="Add money to approved lines, take it away, move it between lines, or re-spread it over the months."
        />
        <ErrorSummary errors={errors} />
        {formBody || (
          <Card>
            <EmptyState icon={GitCompareArrows} text="Only the Budget Officer prepares budget revisions." action={<ButtonLink to={LIST}>Back to revisions</ButtonLink>} />
          </Card>
        )}
        {formBody && (
          <FormActions
            onSubmit={submit}
            onSaveDraft={() => save(false)}
            cancelTo={LIST}
            busy={busy}
            note={canSubmit ? "Submitting sends it to the DAF and the Secretary General for approval." : "Add the lines and fix what the summary lists, then submit."}
          />
        )}
      </Page>
    );
  }

  const status = r.status;
  const readTabs = [
    { key: "details", label: "Details" },
    { key: "lines", label: "Lines", count: rows.length },
    { key: "approvals", label: "Approvals" },
    { key: "documents", label: "Documents", count: (r.attachments || []).length },
    { key: "activity", label: "Activity" },
  ];
  const editTabs = [
    { key: "details", label: "Revision" },
    { key: "approvals", label: "Approvals" },
    { key: "documents", label: "Documents", count: (r.attachments || []).length },
    { key: "activity", label: "Activity" },
  ];
  const activeTab = editable && tab === "lines" ? "details" : tab;

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to revisions", to: LIST }}
        number={r.number}
        type={`Budget revision${fyName ? ` · ${fyName}` : ""}`}
        status={REVISION_STATUS[status]?.label || status}
        statusNote={stepName ? `At “${stepName}”` : REVISION_STATUS[status]?.note}
        title={(editable && form?.title) || r.title}
        facts={[
          REVISION_TYPES[type]?.label || type,
          r.expand?.prepared_by?.name ? { label: "Prepared by", value: r.expand.prepared_by.name } : null,
          r.submitted_at ? { label: "Submitted", value: fmtDate(r.submitted_at) } : null,
          r.applied_at ? { label: "Applied", value: fmtDate(r.applied_at) } : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {editable && <Button icon={Save} onClick={() => save(false)} loading={busy === "draft"} disabled={Boolean(busy)}>Save draft</Button>}
            <DecisionButtons approval={approval} number={r.number} onDone={refresh} />
            {editable && <Button variant="primary" icon={Send} onClick={submit} loading={busy === "submit"} disabled={Boolean(busy)}>Submit for approval</Button>}
          </>
        }
      />

      <ErrorSummary errors={errors} />
      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}
      {status === "returned" && editable && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Returned for changes{returnNote ? `: “${returnNote}”` : ""}. Correct it and submit it again.</span>
        </p>
      )}

      {!editable && !rephasing && (
        <KpiBand
          items={[
            { label: "Increases", value: fmtMoney(r.total_increase) },
            { label: "Decreases", value: fmtMoney(r.total_decrease) },
            { label: "Net change", value: signedMoney(Math.round(Number(r.net_change) || 0)), tone: r.net_change < 0 ? "danger" : "default" },
            { label: "Lines changed", value: fmtNumber(rows.length) },
          ]}
        />
      )}

      <Tabs label="Revision sections" active={activeTab} onChange={setTab} tabs={editable ? editTabs : readTabs} />

      {activeTab === "details" && (editable ? formBody : (
        <Card>
          <CardHeader title="Revision" />
          <Details
            columns={3}
            items={[
              { label: "Type", value: REVISION_TYPES[r.type]?.label || r.type, hint: REVISION_TYPES[r.type]?.hint },
              { label: "Fiscal year", value: fyName },
              { label: "Prepared by", value: r.expand?.prepared_by?.name },
              { label: "Submitted", value: r.submitted_at ? fmtDate(r.submitted_at) : null },
              { label: "Applied to the lines", value: r.applied_at ? fmtDate(r.applied_at) : null },
              { label: "Net change", value: <span className="font-semibold tabular-nums">{signedMoney(Math.round(Number(r.net_change) || 0))}</span> },
              { label: "Reason", value: r.reason ? <span className="whitespace-pre-line">{r.reason}</span> : null, wide: true },
            ]}
          />
        </Card>
      ))}

      {activeTab === "lines" && !editable && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Lines" subtitle={rephasing ? "The lines re-spread over the months. Their annual budget does not change." : "The change to each line and its budget after the revision."} />
          </div>
          {linesTable}
          {spread}
        </Card>
      )}

      {activeTab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Council resolutions, memos and other support for the change." />
          <DocumentUploads collection="budget_revisions" record={r} canAdd={can(["manage_budgets", "approve_budgets"])} canRemove={can("manage_budgets") && EDITABLE.includes(r.status)} onChange={refresh} />
        </Card>
      )}
      {activeTab === "approvals" && <ApprovalTracker approval={approval} actions={trail.actions} />}
      {activeTab === "activity" && <Chatter items={toChatter(trail.actions, trail.audit)} />}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${number}?`}
        description="Any running approval stops. Nothing is changed on the budget lines."
        confirmLabel="Cancel revision"
        danger
        reason={{ label: "Reason", placeholder: "Why is this revision cancelled?" }}
        onConfirm={cancel}
      />
    </Page>
  );
}
