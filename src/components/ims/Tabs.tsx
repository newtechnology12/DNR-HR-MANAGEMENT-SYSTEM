/**
 * Tabs: at most 5, each with a count when it helps ("Awaiting my approval (3)"). Active tab = navy
 * text and a 2.5px blue underline. No scroll arrows: on phones the row scrolls with the finger.
 * Extra views belong in the filter bar, not in more tabs.
 */
import * as React from "react";
import { cn } from "@/utils";

export type TabItem = { key: string; label: string; count?: number | null };

export function Tabs({
  tabs,
  active,
  onChange,
  className,
  label = "Views",
  inset,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  label?: string;
  /** Inside a card: tabs sit on the card's edge with side padding. */
  inset?: boolean;
}) {
  if (import.meta.env.DEV && tabs.length > 5) console.warn(`ims/Tabs: ${tabs.length} tabs — at most 5; move extra views into filters`);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + tabs.length) % tabs.length;
    refs.current[j]?.focus();
    onChange(tabs[j].key);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ims-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        inset && "px-3 sm:px-4",
        className
      )}
    >
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative -mb-px min-h-[44px] whitespace-nowrap border-b-[2.5px] px-3.5 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus",
              on ? "border-ims-link text-ims-primary" : "border-transparent text-ims-muted hover:text-ims-text"
            )}
          >
            {t.label}
            {typeof t.count === "number" && <span className={cn("ml-1 tabular-nums", on ? "text-ims-primary" : "text-ims-faint")}>({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}
