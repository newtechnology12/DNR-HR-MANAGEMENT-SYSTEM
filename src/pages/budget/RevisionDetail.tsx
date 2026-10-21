/**
 * Budget revision: choose the type, the lines and the change per line (or the new monthly spread for
 * a re-phasing), save as draft, submit. Decreases never go below what is already committed or spent;
 * a virement must net to zero. On final approval the lines are updated and the change is audited.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, GitCompareArrows, Plus, Save, Send, Trash2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { BudgetLineUsage, MONTHS_FY, REVISION_TYPES, budgetApi } from "@/lib/budget";
import { rwf, rwfSigned, showDay } from "@/lib/ims";
import { DOC_STATUS, errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { Field, inputCls, Segmented, textareaCls } from "@/components/portal/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import DocumentUploads from "@/components/enterprise/Attachments";

type Row = { budget_line: string; change: number | string; phasing?: (number | string)[] };
const STEPS = [{ key: "draft", label: "Draft" }, { key: "pending_approval", label: "In approval" }, { key: "approved", label: "Applied" }];
const EDITABLE = ["draft", "returned"];
const num = (v: unknown) => Math.round(Number(v) || 0);

export default function RevisionDetail() {
  const { revisionId } = useParams();
  const isNew = revisionId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("lines");
  const [form, setForm] = React.useState<{ type: string; title: string; reason: string; lines: Row[] } | null>(isNew ? { type: "virement", title: "", reason: "", lines: [] } : null);
  const [busy, setBusy] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

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
    if (f && c < 0 && f.budget + c < f.committed + f.actual) return [`${f.code}: cannot reduce below committed + spent (${rwf(f.committed + f.actual)}).`];
    if (type === "rephasing" && f) {
      const ph = (l.phasing || []).map(num);
      if (ph.length !== 12 || ph.reduce((a, v) => a + v, 0) !== f.budget) return [`${f.code}: the months must add up to ${rwf(f.budget)}.`];
    }
    return [];
  });
  if (type === "virement" && rows.length && inc !== dec) problems.push(`Increases (${rwf(inc)}) must equal decreases (${rwf(dec)}).`);
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
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await budgetApi.revisionAction(r.id, "cancel", cancelReason.trim());
      toast.success(`${r.number} cancelled`);
      setCancelOpen(false);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && doc.isLoading) return <div className="p-6"><ListSkeleton rows={8} /></div>;
  if (!isNew && !r) return <div className="p-6"><EmptyState icon={GitCompareArrows} title="Revision not found" text="It may have been deleted." /></div>;
  const status = isNew ? "draft" : r.status;
  const number = isNew ? "New revision" : r.number;
  const options = (usage.data?.items || []).filter((i) => !rows.some((l) => l.budget_line === i.id));

  return (
    <DocumentPage chatter={!isNew && <Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Budget", link: "/dashboard/budget" }, { title: "Revisions", link: "/dashboard/budget/revisions" }, { title: number }]}
        steps={STEPS}
        current={status === "returned" ? "draft" : status}
        actions={
          <>
            {editable && <Button size="sm" onClick={() => save(true)} disabled={busy || !rows.length || problems.length > 0}><Send size={14} /> Save and submit</Button>}
            {editable && <Button size="sm" variant="outline" onClick={() => save(false)} disabled={busy}><Save size={14} /> Save draft</Button>}
            {!isNew && <DecisionButtons approval={r.expand?.approval} number={r.number} onDone={refresh} />}
            {!isNew && can("manage_budgets") && ["draft", "returned", "pending_approval"].includes(r.status) && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelOpen(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={status === "approved" ? { label: "Applied", tone: "success" } : status === "rejected" ? { label: "Rejected", tone: "danger" } : status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : status === "returned" ? { label: "Returned", tone: "warning" } : undefined}>
        <SheetTitle kicker={`Budget revision · ${usage.data?.fiscal_year?.name || r?.expand?.fiscal_year?.name || ""}`} title={number} badges={!isNew && <StatusBadge status={r.status} map={DOC_STATUS} />} />

        {editable && form ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="Type" required className="lg:col-span-2" hint={REVISION_TYPES[form.type]?.hint}>
              <Segmented value={form.type} onChange={(t) => setForm({ ...form, type: t, lines: form.lines.map((l) => ({ ...l, phasing: t === "rephasing" ? l.phasing || byId[l.budget_line]?.phasing : undefined })) })} options={Object.entries(REVISION_TYPES).map(([value, t]) => ({ value, label: t.label }))} />
            </Field>
            <Field label="Title" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="e.g. Virement to cover printing of the annual report" /></Field>
            <Field label="Reason" required hint="At least 10 characters; the approvers read this."><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={cn(textareaCls, "min-h-[44px]")} /></Field>
          </div>
        ) : (
          <FieldGrid
            left={[
              { label: "Type", value: REVISION_TYPES[r.type]?.label || r.type, hint: REVISION_TYPES[r.type]?.hint },
              { label: "Title", value: r.title },
              { label: "Reason", value: r.reason },
            ]}
            right={[
              { label: "Prepared by", value: r.expand?.prepared_by?.name },
              { label: "Submitted", value: r.submitted_at ? showDay(r.submitted_at) : "" },
              { label: "Applied to the lines", value: r.applied_at ? showDay(r.applied_at) : "" },
              { label: "Net change", value: <span className="font-semibold tabular-nums">{rwfSigned(r.net_change)}</span> },
            ]}
          />
        )}

        <Notebook tabs={[{ key: "lines", label: "Lines", count: rows.length }, ...(isNew ? [] : [{ key: "documents", label: "Documents", count: (r.attachments || []).length }, { key: "approval", label: "Approval" }])]} active={tab} onChange={setTab} />
        <div className="space-y-3 pt-4">
          {tab === "lines" && (
            <>
              {usage.isLoading ? <ListSkeleton rows={4} /> : (
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[860px]">
                    <thead>
                      <tr><th>Budget line</th><th className="text-right">Current budget</th><th className="text-right">Committed + spent</th><th className="text-right">Available</th><th className="text-right">{type === "rephasing" ? "Annual (unchanged)" : "Change"}</th><th className="text-right">New budget</th>{editable && <th />}</tr>
                    </thead>
                    <tbody>
                      {rows.map((l, i) => {
                        const f = byId[l.budget_line];
                        const c = type === "rephasing" ? 0 : num(l.change);
                        const current = f ? f.budget : (l as any).current || 0;
                        const used = f ? f.committed + f.actual : 0;
                        const tooLow = f && c < 0 && current + c < used;
                        return (
                          <React.Fragment key={i}>
                            <tr>
                              <td className="min-w-[260px]">
                                {editable && !l.budget_line ? (
                                  <select value="" onChange={(e) => setLine(i, { budget_line: e.target.value, phasing: type === "rephasing" ? byId[e.target.value]?.phasing : undefined })} className={cn(inputCls, "h-9")} aria-label="Budget line">
                                    <option value="">Choose the line…</option>
                                    {options.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.account} ({rwf(o.available)} available)</option>)}
                                  </select>
                                ) : (
                                  <>
                                    <span className="block font-mono text-[12.5px] font-semibold text-slate-800">{f?.code || (l as any).code}</span>
                                    <span className="block text-[12px] text-slate-500">{f ? `${f.account} · ${f.department_name} · ${f.funding_code}${f.project_code ? ` · ${f.project_code}` : ""}` : (l as any).name}</span>
                                  </>
                                )}
                              </td>
                              <td className="text-right tabular-nums">{rwf(current)}</td>
                              <td className="text-right tabular-nums text-slate-600">{f ? rwf(used) : "—"}</td>
                              <td className="text-right tabular-nums text-slate-600">{f ? rwf(f.available) : "—"}</td>
                              <td className="text-right">
                                {type === "rephasing" ? <span className="tabular-nums text-slate-500">{rwf(current)}</span> : editable ? (
                                  <input type="number" step={1000} value={l.change} onChange={(e) => setLine(i, { change: e.target.value })} className={cn(inputCls, "h-9 w-40 text-right tabular-nums", tooLow && "border-red-400")} aria-label="Change (negative to decrease)" />
                                ) : (
                                  <span className={cn("font-medium tabular-nums", c < 0 && "text-red-700")}>{rwfSigned(c)}</span>
                                )}
                              </td>
                              <td className={cn("text-right font-semibold tabular-nums", tooLow && "text-red-700")}>{rwf(current + c)}</td>
                              {editable && (
                                <td className="text-right">
                                  <button type="button" onClick={() => setForm({ ...form!, lines: form!.lines.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line"><Trash2 size={14} /></button>
                                </td>
                              )}
                            </tr>
                            {type === "rephasing" && (l.budget_line || l.phasing) && (
                              <tr>
                                <td colSpan={editable ? 7 : 6} className="bg-slate-50/60">
                                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
                                    {MONTHS_FY.map((m, k) => (
                                      <label key={m} className="text-[11.5px] text-slate-500">
                                        {m}
                                        {editable ? (
                                          <input type="number" min={0} value={(l.phasing || [])[k] ?? 0} onChange={(e) => setLine(i, { phasing: Array.from({ length: 12 }, (_, z) => (z === k ? e.target.value : (l.phasing || [])[z] ?? 0)) })} className={cn(inputCls, "mt-0.5 h-8 px-2 text-right text-[12px] tabular-nums")} />
                                        ) : (
                                          <span className="block text-right text-[12px] tabular-nums text-slate-800">{rwf(num((l.phasing || [])[k]))}</span>
                                        )}
                                      </label>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {!rows.length && <tr><td colSpan={7} className="py-8 text-center text-[13px] text-slate-500">No lines yet{editable ? " — add the lines this revision changes." : "."}</td></tr>}
                    </tbody>
                    {rows.length > 0 && type !== "rephasing" && (
                      <tfoot>
                        <tr className="border-t border-slate-200 text-[12.5px]">
                          <td className="font-semibold">Increases {rwf(inc)} · Decreases {rwf(dec)}</td>
                          <td colSpan={3} />
                          <td className="text-right font-semibold tabular-nums">{rwfSigned(inc - dec)}</td>
                          <td colSpan={editable ? 2 : 1} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
              {editable && <Button size="sm" variant="outline" onClick={() => setForm({ ...form!, lines: [...form!.lines, { budget_line: "", change: "" }] })} disabled={!options.length}><Plus size={14} /> Add a line</Button>}
              {editable && rows.length > 0 && (problems.length ? (
                <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                  {problems.map((p) => <li key={p} className="flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {p}</li>)}
                </ul>
              ) : (
                <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-700"><CheckCircle2 size={13} /> Ready to submit.</p>
              ))}
            </>
          )}
          {tab === "documents" && !isNew && <DocumentUploads collection="budget_revisions" record={r} canAdd={can(["manage_budgets", "approve_budgets"])} canRemove={can("manage_budgets") && EDITABLE.includes(r.status)} onChange={refresh} />}
          {tab === "approval" && !isNew && <ApprovalTracker approval={r.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Cancel {number}?</DialogTitle>
            <DialogDescription>Any running approval stops. Nothing is changed on the budget lines.</DialogDescription>
          </DialogHeader>
          <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason" className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep</Button>
            <Button variant="danger" disabled={!cancelReason.trim() || busy} onClick={cancel}>Cancel revision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DocumentPage>
  );
}
