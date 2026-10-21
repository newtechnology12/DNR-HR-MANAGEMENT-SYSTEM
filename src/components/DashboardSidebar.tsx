/**
 * Main navigation: groups from src/lib/navigation.ts filtered by the person's merged permissions (a page
 * appears once, in the first group that lists it), counts for what waits for them, a "Search or jump to"
 * filter (Ctrl K) and the signed-in person. Groups can be folded; the open state is remembered.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import { useAuth, usePermissions } from "@/context/auth.context";
import { cn } from "@/utils/cn";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProfileDropdown from "./ProfileDropdown";
import LogoutModal from "./modals/LogoutModal";
import useModalState from "@/hooks/useModalState";
import NotificationBell from "./enterprise/NotificationBell";
import { BrandLogo } from "./enterprise/BrandMark";
import { NAVIGATION } from "@/lib/navigation";
import { ATTENTION, useNavCounts } from "@/lib/navCounts";
import { useT } from "@/i18n";

const OPEN_KEY = "ims.nav.open";
const ALWAYS_OPEN = ["workspace", "requests", "support"];

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}

const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export default function DashboardSidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { user }: any = useAuth();
  const { can, roles } = usePermissions();
  const { t } = useT();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readOpen);
  const search = useRef<HTMLInputElement>(null);
  const counts = useNavCounts(user?.id);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    return NAVIGATION.map((g) => ({
      ...g,
      label: t(`nav.group.${g.key}`, g.label),
      items: g.items
        .filter((i) => (i.perms === "*" || can(i.perms)) && !(i.hideIf && can(i.hideIf)))
        .filter((i) => (seen.has(i.link) ? false : (seen.add(i.link), true)))
        .map((i) => ({ ...i, label: t(`nav.${i.key}`, i.label) })),
    })).filter((g) => g.items.length);
  }, [can, t]);

  // The most specific link matching the current URL is highlighted (e.g. a Settings tab over "General settings").
  const activeLink = useMemo(() => {
    const links = groups.flatMap((g) => g.items.map((i) => i.link));
    return links.filter((l) => location.pathname === l || location.pathname.startsWith(`${l}/`)).sort((x, y) => y.length - x.length)[0];
  }, [groups, location.pathname]);
  const activeGroup = groups.find((g) => g.items.some((i) => i.link === activeLink))?.key;

  useEffect(() => {
    if (activeGroup && openGroups[activeGroup] === false) setOpenGroups((o) => ({ ...o, [activeGroup]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  // Ctrl K / ⌘K jumps to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (key: string, isOpen: boolean) => {
    const next = { ...openGroups, [key]: !isOpen };
    setOpenGroups(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch (_) {}
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) })).filter((g) => g.items.length)
    : groups;

  const [showProfile, setshowProfile] = useState(false);
  const logoutModal = useModalState();
  const roleNames = (roles.length ? roles.map((r) => r.name) : [user?.role?.name]).filter(Boolean).map((n: string) => n.replace(/\s*\/\s*/g, " · "));

  return (
    <Fragment>
      {user && (
        <>
          {open && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden />}
          <nav
            aria-label="Main menu"
            className={cn("fixed z-50 flex h-dvh w-[280px] flex-col border-r border-[#E3E8EF] bg-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}
          >
            <div aria-hidden className="flex h-1 shrink-0">
              <span className="flex-[2] bg-[#00A1DE]" />
              <span className="flex-1 bg-[#FAD201]" />
              <span className="flex-1 bg-[#20603D]" />
            </div>
            <div className="flex items-center gap-2.5 px-[18px] pb-3.5 pt-[18px]">
              <Link to="/dashboard" aria-label="Dashboard" className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#0B3A6F] text-[13px] font-extrabold text-white">IMS</span>
                <span className="min-w-0">
                  <BrandLogo className="h-[18px]" />
                  <span className="mt-0.5 block truncate text-[12px] text-[#5B6577]">Integrated Management System</span>
                </span>
              </Link>
              <NotificationBell className="hidden lg:flex" />
            </div>
            <div className="px-3.5 pb-2.5">
              <label className="flex h-[38px] items-center gap-2 rounded-lg border border-[#DDE3EC] bg-[#F8FAFC] px-2.5 focus-within:border-[#1466C0] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1466C0]/15">
                <Search size={15} className="shrink-0 text-[#5B6577]" aria-hidden />
                <span className="sr-only">{t("common.jumpTo", "Search the system")}</span>
                <input
                  ref={search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                  placeholder={t("common.searchOrJump", "Search or jump to…")}
                  className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] font-medium text-[#14213D] outline-none placeholder:text-[#5B6577]/80"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="rounded p-0.5 text-[#5B6577] hover:text-[#14213D]"><X size={13} /></button>
                ) : (
                  <kbd className="hidden rounded border border-[#DDE3EC] bg-white px-[5px] py-px text-[11px] font-semibold text-[#5B6577] sm:inline">Ctrl K</kbd>
                )}
              </label>
            </div>

            <ScrollArea className="h-full w-full">
              <div className="flex flex-col gap-0.5 px-3 pb-3.5 pt-1.5">
                {visible.map((group, gi) => {
                  const isOpen = q ? true : openGroups[group.key] !== undefined ? openGroups[group.key] : ALWAYS_OPEN.includes(group.key) || group.key === activeGroup;
                  return (
                    <div key={group.key}>
                      <button
                        type="button"
                        onClick={() => toggle(group.key, isOpen)}
                        aria-expanded={isOpen}
                        className={cn("group/h flex w-full items-center justify-between rounded-md px-3 pb-1.5 text-[12px] font-bold text-[#5B6577] hover:text-[#0B3A6F]", gi === 0 ? "pt-2.5" : "pt-4")}
                      >
                        {group.label}
                        <ChevronDown size={13} className={cn("opacity-0 transition group-hover/h:opacity-100", !isOpen && "-rotate-90 opacity-60")} />
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-0.5">
                          {group.items.map((link) => {
                            const isActive = link.link === activeLink;
                            const n = (counts.data as any)?.[link.key] || 0;
                            return (
                              <Link
                                to={link.link}
                                key={link.key}
                                onClick={onClose}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                  "group flex h-10 items-center gap-[11px] rounded-lg px-3 text-[14px] font-semibold transition-colors",
                                  isActive ? "bg-[#EAF2FC] text-[#0B3A6F] shadow-[inset_3px_0_0_#1466C0]" : "text-[#36435A] hover:bg-[#EEF2F8] hover:text-[#0B3A6F]"
                                )}
                              >
                                <link.icon size={18} strokeWidth={2} className={cn("shrink-0", isActive ? "text-[#1466C0]" : "text-current")} aria-hidden />
                                <span className="min-w-0 flex-1 truncate">{link.label}</span>
                                {n > 0 && (
                                  <span className={cn("rounded-full px-2 py-px text-[11.5px] font-bold tabular-nums", ATTENTION.has(link.key) ? "bg-[#FEF3D6] text-[#8A5A00]" : "bg-[#EEF2F8] text-[#36435A]")} aria-label={`${n} waiting`}>
                                    {n}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!visible.length && <p className="px-4 py-6 text-center text-[12.5px] text-[#5B6577]">{t("common.noResults")}</p>}
              </div>
            </ScrollArea>

            <div className="relative border-t border-[#E3E8EF] bg-white">
              <ProfileDropdown onLogout={() => logoutModal.open()} close={() => setshowProfile(false)} open={showProfile} />
              <button
                type="button"
                onClick={() => setshowProfile(true)}
                aria-label="Account menu"
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-[#F8FAFC]"
              >
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#DCEAFB] text-[13px] font-extrabold text-[#0B3A6F]">{initials(user?.names || user?.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold capitalize text-[#14213D]">{user?.names || user?.name}</span>
                  <span className="block truncate text-[12px] text-[#5B6577]" title={roleNames.join(", ")}>
                    {roleNames[0] || "User"}
                    {roleNames.length > 1 && <span className="text-[#5B6577]/70"> +{roleNames.length - 1}</span>}
                  </span>
                </span>
                <ChevronsUpDown size={16} className="shrink-0 text-[#5B6577]" aria-hidden />
              </button>
            </div>
          </nav>
        </>
      )}

      <LogoutModal onClose={() => logoutModal.close()} open={logoutModal.isOpen} />
    </Fragment>
  );
}
