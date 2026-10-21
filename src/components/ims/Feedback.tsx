/**
 * Feedback: EmptyState (small icon, one line on what is missing, one action), ErrorState (what went
 * wrong + "Try again"), and toasts — bottom-right, 4 seconds, saying the result:
 * "PR-2026-000031 sent to the Finance Manager."
 */
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Inbox, LucideIcon, RotateCw } from "lucide-react";
import { cn } from "@/utils";
import { Button } from "./Button";

export function EmptyState({ icon: Icon = Inbox, text, action, className, compact }: { icon?: LucideIcon; text: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 text-center", compact ? "py-8" : "py-12", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ims-subtle text-ims-faint" aria-hidden>
        <Icon size={18} />
      </span>
      <p className="max-w-md text-t-body text-ims-muted">{text}</p>
      {action}
    </div>
  );
}

export function ErrorState({ text = "This list could not be loaded.", detail, onRetry, className }: { text?: React.ReactNode; detail?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ims-danger-bg text-ims-danger" aria-hidden>
        <AlertTriangle size={18} />
      </span>
      <div>
        <p className="text-t-body font-semibold text-ims-text">{text}</p>
        {detail && <p className="mt-1 max-w-md text-t-small text-ims-muted">{detail}</p>}
      </div>
      {onRetry && <Button variant="secondary" icon={RotateCw} onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Toasts say the result in one sentence. Errors say what to do next. */
export const notify = {
  success: (message: string) => toast.success(message),
  info: (message: string) => toast(message),
  error: (message: string) => toast.error(message),
};
