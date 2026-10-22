/**
 * Ask HR to correct working days without a clock-in (mission, training, meeting outside the office…).
 * HR approves and the days are added to the attendance log; the request and the decision are audited.
 */
import * as React from "react";
import { useQueryClient } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { FileDrop } from "@/components/portal/kit";
import { Button, Checkbox, Field, Modal, ModalSection, Select, Textarea } from "@/components/ims";
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
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Ask HR to correct my attendance"
      description="For working days you were on duty but did not clock in. HR checks them and adds them to your attendance log."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Send to HR ({picked.size} day{picked.size === 1 ? "" : "s"})</Button>
        </>
      }
    >
      <ModalSection title="Days without a clock-in" description="Days within the last 90 days only. Days on approved leave or public holidays are not needed.">
        {days.length ? (
          <fieldset>
            <legend className="sr-only">Days to correct</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {days.map((d) => (
                <Checkbox key={d.key} id={`cr-day-${d.key}`} label={format(d.date, "EEE d MMM yyyy")} checked={picked.has(d.key)} onChange={() => toggle(d.key)} />
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-t-body text-ims-muted">No working day without a clock-in in the last 30 days.</p>
        )}
        {tried && errors.days && (
          <p className="flex items-start gap-1 text-t-hint text-ims-danger" role="alert">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden /> {errors.days}
          </p>
        )}
      </ModalSection>
      <ModalSection title="Why">
        <Field label="Reason" required htmlFor="cr-reason">
          <Select id="cr-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(CORRECTION_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Explanation" required error={tried && errors.explanation} htmlFor="cr-expl" hint="Where you were and why you could not clock in.">
          <Textarea
            id="cr-expl"
            className="min-h-[80px]"
            value={explanation}
            invalid={Boolean(tried && errors.explanation)}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="e.g. Mission to Gicumbi district for the councillors' training (mission order signed by my head of department)."
          />
        </Field>
        <Field label="Supporting document" hint="Mission order, invitation or training certificate (optional)">
          <FileDrop files={files} onChange={setFiles} max={5} />
        </Field>
      </ModalSection>
    </Modal>
  );
}
