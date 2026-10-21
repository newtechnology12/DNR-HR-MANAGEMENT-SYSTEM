/**
 * "Export" button with Excel / PDF / CSV. Pass `permission` to show it only to roles that hold the
 * module's export right (permission matrix "X"); every export is logged in the audit trail.
 */
import * as React from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/context/auth.context";
import { ExportFormat } from "@/lib/exporter";

export default function ExportMenu({
  onExport,
  permission,
  disabled,
  label = "Export",
  size = "sm",
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
      toast.error(e?.message || "Export failed");
    } finally {
      setBusy(null);
    }
  };
  const items: { f: ExportFormat; label: string; hint: string; icon: any; color: string }[] = [
    { f: "xlsx", label: "Excel workbook", hint: ".xlsx with header and totals", icon: FileSpreadsheet, color: "text-emerald-700" },
    { f: "pdf", label: "PDF report", hint: "printable, with RALGA header", icon: FileText, color: "text-red-600" },
    { f: "csv", label: "CSV (open format)", hint: "for other systems", icon: Sheet, color: "text-slate-600" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={disabled || Boolean(busy)}>
          <Download size={14} className="mr-1.5" />
          {busy ? "Preparing…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 bg-white">
        <DropdownMenuLabel className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Export what you see</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((i) => (
          <DropdownMenuItem key={i.f} onClick={() => run(i.f)} className="cursor-pointer gap-2.5 py-2">
            <i.icon size={16} className={i.color} />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">{i.label}</span>
              <span className="text-[11.5px] text-slate-500">{i.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
