/**
 * Ask HR to correct working days without a clock-in (mission, training, meeting outside the office…).
 * HR approves and the days are added to the attendance log; the request and the decision are audited.
 */
import * as React from "react";
import { useQueryClient } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarCheck2, FileText } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { Field, FileDrop, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";
import type { CalDay } from "./WorkspaceKit";

export const CORRECTION_REASONS: Record<string, string> = {
  mission: "Mission (official travel)",
  training: "Training or workshop",
  meeting: "Meeting outside the office",
  approved_absence: "Approved absence",
  forgot: "I forgot to clock in",
  system: "Clock-in did not work",
  other: "Other",
};

export default function CorrectionDialog({ open, onClose, days, uid }: { open: boolean; onClose: () => void; days: CalDay[]; uid: string }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [reason, setReason] = React.useState("mission");
  const [explanation, setExplanation] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setPicked(new Set(days.map((d) => d.key)));
    setReason("mission");
    setExplanation("");
    setFiles([]);
    setTried(false);
  }, [open, days]);

  const errors = {
    days: !picked.size && "Choose at least one day.",
    explanation: explanation.trim().length < 10 && "Explain briefly (at least 10 characters), e.g. the mission and where.",
  };

  async function submit() {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("employee", uid);
      fd.append("dates", JSON.stringify([...picked].sort()));
      fd.append("reason", reason);
      fd.append("explanation", explanation.trim());
      for (const f of files) fd.append("attachments", f);
      const r = await pocketbase.collection("attendance_corrections").create(fd);
      toast.success(`${r.number} sent to HR: ${picked.size} day${picked.size === 1 ? "" : "s"}`);
      queryClient.invalidateQueries(["my-dashboard"]);
      queryClient.invalidateQueries(["my-attendance"]);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (k: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  return (
    <FormDialog open={open} onClose={onClose} icon={CalendarCheck2} title="Ask HR to correct my attendance" description="For working days you were on duty but did not clock in. HR checks and adds them to your attendance log." submitLabel={busy ? "Sending…" : `Send to HR (${picked.size} day${picked.size === 1 ? "" : "s"})`} busy={busy} onSubmit={submit}>
      <FormBlock icon={CalendarCheck2} title="Days without a clock-in">
        {days.length ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days to correct">
            {days.map((d) => (
              <button key={d.key} type="button" aria-pressed={picked.has(d.key)} onClick={() => toggle(d.key)}
                className={cn("rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold", picked.has(d.key) ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-ims-field bg-white text-ims-muted hover:bg-ims-thead")}>
                {format(d.date, "EEE d MMM")}
              </button>
            ))}
          </div>
        ) : <p className="text-[13px] text-ims-muted">No working day without a clock-in in the last 30 days.</p>}
        {tried && errors.days && <p className="text-[12px] text-red-600">{errors.days}</p>}
        <p className="text-[12px] text-ims-muted">Days within the last 90 days only. Days on approved leave or public holidays are not needed.</p>
      </FormBlock>
      <FormBlock icon={FileText} title="Why">
        <div className="grid gap-4">
          <Field label="Reason" required htmlFor="cr-reason">
            <select id="cr-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(CORRECTION_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Explanation" required error={tried && errors.explanation} htmlFor="cr-expl">
            <textarea id="cr-expl" className={cn(textareaCls, "min-h-[80px]")} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="e.g. Mission to Gicumbi district for the councillors' training (mission order signed by my head of department)." />
          </Field>
          <Field label="Supporting document" hint="Mission order, invitation or training certificate (optional)">
            <FileDrop files={files} onChange={setFiles} max={5} />
          </Field>
        </div>
      </FormBlock>
    </FormDialog>
  );
}
