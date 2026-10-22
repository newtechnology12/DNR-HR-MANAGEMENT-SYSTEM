/**
 * "Export" button with Excel / PDF / CSV. Pass `permission` to show it only to roles that hold the
 * module's export right (permission matrix "X"); every export is logged in the audit trail.
 * The trigger is the kit's secondary button (40px, like the filter bar and page header controls);
 * `size="sm"` gives the compact 34px button.
 */
import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonClass } from "@/components/ims";
import { usePermissions } from "@/context/auth.context";
import { ExportFormat } from "@/lib/exporter";
import { cn } from "@/utils";

export default function ExportMenu({
  onExport,
  permission,
  disabled,
  label = "Export",
  size,
}: {
  onExport: (format: ExportFormat) => Promise<void> | void;
  permission?: string | string[];
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default";
}) {
  const { can } = usePermissions();
  const [busy, setBusy] = React.useState<ExportFormat | null>(null);
  if (permission && !can(permission)) return null;
  const run = async (f: ExportFormat) => {
    setBusy(f);
    try {
      await onExport(f);
    } catch (e: any) {
      toast.error(e?.message || "The export could not be prepared. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const items: { f: ExportFormat; label: string; hint: string; icon: any; color: string }[] = [
    { f: "xlsx", label: "Excel workbook", hint: ".xlsx with header and totals", icon: FileSpreadsheet, color: "text-ims-success" },
    { f: "pdf", label: "PDF report", hint: "Printable, with the RALGA header", icon: FileText, color: "text-ims-danger" },
    { f: "csv", label: "CSV (open format)", hint: "For other systems", icon: Sheet, color: "text-ims-body" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={disabled || Boolean(busy)}
        aria-busy={Boolean(busy) || undefined}
        className={buttonClass({ variant: "secondary", size: size === "sm" ? "sm" : "md" })}
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
        {busy ? "Preparing…" : label}
        <ChevronDown size={14} className="-mr-1 text-ims-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-control border-ims-border bg-ims-card p-1 shadow-menu">
        <DropdownMenuLabel className="px-2.5 py-1.5 text-t-small font-semibold text-ims-muted">Export what you see</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-ims-divider" />
        {items.map((i) => (
          <DropdownMenuItem key={i.f} onSelect={() => run(i.f)} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-ims-text focus:bg-ims-subtle">
            <i.icon size={16} className={cn("shrink-0", i.color)} aria-hidden />
            <span className="flex flex-col">
              <span className="text-t-body font-semibold text-ims-text">{i.label}</span>
              <span className="text-t-small text-ims-muted">{i.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
