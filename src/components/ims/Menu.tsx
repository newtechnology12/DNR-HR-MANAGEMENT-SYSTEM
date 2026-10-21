/**
 * "More" menu for page and detail actions beyond the primary + two secondary buttons
 * (delegate, escalate, cancel, delete…). Danger items are red and still confirm before acting.
 */
import { LucideIcon, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/utils";
import { buttonClass } from "./Button";

export type MenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; hidden?: boolean };

export function MoreMenu({ items, label = "More" }: { items: MenuItem[]; label?: string }) {
  const shown = items.filter((i) => !i.hidden);
  if (!shown.length) return null;
  const normal = shown.filter((i) => !i.danger);
  const danger = shown.filter((i) => i.danger);
  const item = (a: MenuItem) => (
    <DropdownMenuItem
      key={a.label}
      disabled={a.disabled}
      onSelect={a.onSelect}
      className={cn("flex min-h-[38px] cursor-pointer items-center gap-2 rounded-md px-2.5 text-[14px]", a.danger ? "text-ims-danger focus:bg-ims-danger-bg focus:text-ims-danger" : "text-ims-text focus:bg-ims-subtle")}
    >
      {a.icon && <a.icon size={16} className="shrink-0" aria-hidden />}
      {a.label}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonClass({ variant: "secondary" })}>
        <MoreHorizontal size={16} aria-hidden /> {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px] rounded-control border-ims-border p-1 shadow-menu">
        {normal.map(item)}
        {normal.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
