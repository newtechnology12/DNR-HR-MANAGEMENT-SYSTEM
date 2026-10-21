/**
 * General ledger → New journal / Edit journal. The Accountant records an adjustment the modules cannot post
 * (accruals, reclassifications, allocations); it reaches the ledger when the Director of Finance approves it.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { JournalLineInput, ledgerApi } from "@/lib/ledger";
import { DatePicker, ErrorSummary, Field, FormActions, FormBody, FormError, FormSection, Page, PageHeader, SummaryPanel, Textarea, fmtNumber, notify } from "@/components/ims";
import LinesEditor, { emptyLine, linesTotals } from "@/components/ledger/LinesEditor";
import { ListSkeleton } from "@/components/enterprise/ui";

const today = () => new Date().toISOString().slice(0, 10);

export default function JournalEditor() {
  const { journalId } = useParams();
  const navigate = useNavigate();
  const existing = useQuery(["journal-edit", journalId], async () => {
    const j: any = await pocketbase.collection("gl_journals").getOne(journalId!);
    const lines: any[] = await pocketbase.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"`, sort: "line_no" });
    return { j, lines };
  }, { enabled: Boolean(journalId) });
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");
  const [lines, setLines] = React.useState<JournalLineInput[]>([emptyLine(), emptyLine()]);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [busy, setBusy] = React.useState<"submit" | "draft" | null>(null);
  const [invalid, setInvalid] = React.useState<Set<number>>(new Set());
  React.useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setDate(d.j.date.slice(0, 10));
    setDescription(d.j.description);
    setLines(d.lines.map((l) => ({ account: l.account, debit: l.debit || "", credit: l.credit || "", description: l.description, department: l.department, funding_source: l.funding_source, project: l.project })));
  }, [existing.data]);

  const t = linesTotals(lines);
  const filled = lines.filter((l) => l.account && (Number(l.debit) || Number(l.credit)));
  const check = () => {
    const out: FormError[] = [];
    const bad = new Set<number>();
    if (!date) out.push({ field: "journal-date", message: "Choose the date of the journal" });
    if (description.trim().length < 5) out.push({ field: "journal-description", message: "Describe the journal: what it records and why (at least 5 characters)" });
    lines.forEach((l, i) => {
      const amount = Number(l.debit) || Number(l.credit);
      if (!l.account && amount) {
        out.push({ field: `line-${i}-account`, message: `Line ${i + 1}: choose the account` });
        bad.add(i);
      }
      if (l.account && !amount) {
        out.push({ field: `line-${i}-account`, message: `Line ${i + 1}: enter a debit or a credit` });
        bad.add(i);
      }
    });
    if (filled.length < 2) out.push({ message: "A journal needs at least two lines with an account and an amount" });
    if (t.difference) out.push({ message: `Debits and credits must be equal — the difference is ${fmtNumber(Math.abs(t.difference))}` });
    setInvalid(bad);
    setErrors(out);
    return out.length === 0;
  };
  const body = () => ({
    date, description: description.trim(),
    lines: filled.map((l) => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
  });
  const save = async (submit: boolean) => {
    if (!check()) return;
    setBusy(submit ? "submit" : "draft");
    try {
      const r = journalId ? await ledgerApi.journal(journalId, "update", body()) : await ledgerApi.createJournal(body());
      if (submit) {
        await ledgerApi.journal(r.id, "submit");
        notify.success(`${r.number} sent to the Director of Finance for approval.`);
      } else notify.success(`${r.number} saved as a draft.`);
      navigate(`/dashboard/finance/journals/${r.id}`);
    } catch (e) {
      setErrors([{ message: errorMessage(e) }]);
    } finally {
      setBusy(null);
    }
  };
  if (journalId && existing.isLoading) return <Page><ListSkeleton rows={6} /></Page>;
  const editable = !existing.data || ["draft", "returned"].includes(existing.data.j.status);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "General ledger", to: "/dashboard/finance/journals" }, { label: "Journal entries", to: "/dashboard/finance/journals" }, { label: journalId ? existing.data?.j.number || "Journal" : "New journal" }]}
        title={journalId ? `Edit ${existing.data?.j.number || "journal"}` : "New journal"}
        subtitle="For adjustments the modules do not post themselves: accruals, reclassifications, allocations. The Director of Finance approves it before it reaches the ledger."
      />
      {!editable ? (
        <ErrorSummary title="This journal cannot be changed" errors={[{ message: `It is ${existing.data?.j.status.replace(/_/g, " ")}; only drafts and returned journals are edited.` }]} />
      ) : (
        <>
          <ErrorSummary errors={errors} />
          <FormBody
            aside={
              <SummaryPanel
                rows={[["Debits", fmtNumber(t.debit)], ["Credits", fmtNumber(t.credit)], ["Difference", fmtNumber(Math.abs(t.difference))]]}
                checklist={[
                  { label: "Date and description", done: Boolean(date) && description.trim().length >= 5 },
                  { label: "At least two lines", done: filled.length >= 2 },
                  { label: "Debits equal credits", done: filled.length >= 2 && !t.difference },
                ]}
              >
                <p className="mt-4 border-t border-ims-divider pt-4 text-t-small text-ims-muted">Bank and cash accounts are posted by receipts, payments and transfers, and the payables and receivables control accounts by their modules — they are not in the account list.</p>
              </SummaryPanel>
            }
          >
            <FormSection title="Journal" description="The date decides the month it is posted to; that month must be open.">
              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <Field label="Date" required htmlFor="journal-date"><DatePicker id="journal-date" value={date} onChange={setDate} /></Field>
                <Field label="Description" required htmlFor="journal-description" hint="Say what is recorded and why, e.g. “Accrual of September electricity (bill received in October)”.">
                  <Textarea id="journal-description" className="min-h-[72px]" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
                </Field>
              </div>
            </FormSection>
          </FormBody>
          {/* the lines take the full width: amounts stay in view without scrolling sideways */}
          <FormSection number={2} title="Lines" description="Each line is a debit or a credit on one account, with the department, funding source and project it belongs to.">
            <LinesEditor lines={lines} onChange={setLines} invalid={invalid} />
          </FormSection>
          <FormActions
            submitLabel="Submit for approval"
            onSubmit={() => save(true)}
            onSaveDraft={() => save(false)}
            cancelTo={journalId ? `/dashboard/finance/journals/${journalId}` : "/dashboard/finance/journals"}
            busy={busy}
            note={t.debit ? `${filled.length} line${filled.length === 1 ? "" : "s"} · RWF ${fmtNumber(t.debit)}` : undefined}
          />
        </>
      )}
    </Page>
  );
}
