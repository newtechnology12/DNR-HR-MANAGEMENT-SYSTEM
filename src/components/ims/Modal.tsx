/**
 * Modal and ConfirmDialog. A confirmation's title is a question ("Reject this requisition?"), one line
 * says what happens, a reason field appears when rejecting or returning, and the buttons are
 * "Cancel" + the action word ("Reject"). Only modals carry a shadow.
 */
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { Button } from "./Button";
import { Field, Textarea } from "./Form";

const WIDTH = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof WIDTH;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("flex max-h-[92vh] flex-col gap-0 !p-0", WIDTH[size])}>
        <div className="shrink-0 border-b border-ims-divider px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="text-[18px] font-extrabold leading-snug text-ims-text">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-1 text-t-body text-ims-muted">{description}</DialogDescription> : <DialogDescription className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogDescription>}
        </div>
        {children && <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 [counter-reset:ims-section]">{children}</div>}
        {footer && <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-ims-divider px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

/** Numbered group inside a dialog form ("1 · Supplier"); numbers count up by themselves. */
export function ModalSection({ title, description, children, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 border-t border-ims-divider pt-4 [counter-increment:ims-section] first:border-t-0 first:pt-0", className)}>
      <header>
        <h3 className="text-[15px] font-extrabold text-ims-text">
          <span className="before:content-[counter(ims-section)]" />
          <span className="px-1.5 text-ims-faint">·</span>
          {title}
        </h3>
        {description && <p className="mt-0.5 text-t-small text-ims-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger,
  reason,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** A question: "Reject this requisition?" */
  title: string;
  /** One line on what happens next. */
  description: React.ReactNode;
  /** The action word: "Reject", "Return", "Delete". */
  confirmLabel: string;
  danger?: boolean;
  /** Ask for a reason (rejecting, returning). */
  reason?: { label?: string; placeholder?: string; min?: number; required?: boolean };
  onConfirm: (reason: string) => unknown | Promise<unknown>;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setText("");
      setTouched(false);
    }
  }, [open]);
  const min = reason?.min ?? (reason?.required ? 5 : 0);
  const tooShort = Boolean(reason) && (reason?.required ?? true) && text.trim().length < min;
  const go = async () => {
    setTouched(true);
    if (tooShort) return;
    setBusy(true);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (_) {
      // The caller reports the error (toast); keep the dialog open so the person can retry or cancel.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={go} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      {reason && (
        <Field label={reason.label || "Reason"} required={reason.required ?? true} htmlFor="confirm-reason" error={touched && tooShort ? `Write at least ${min} characters so the requester knows what to change.` : null}>
          <Textarea id="confirm-reason" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder || "Explain the decision"} invalid={touched && tooShort} />
        </Field>
      )}
    </Modal>
  );
}
