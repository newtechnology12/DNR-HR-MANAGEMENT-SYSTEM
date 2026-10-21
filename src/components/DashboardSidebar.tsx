/**
 * Main navigation: groups from src/lib/navigation.ts filtered by the person's merged permissions,
 * collapsible (open state remembered), with a quick "Jump to" filter and the signed-in person's roles.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import { useAuth, usePermissions } from "@/context/auth.context";
import { cn } from "@/utils/cn";
import Avatar from "./shared/Avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProfileDropdown from "./ProfileDropdown";
import LogoutModal from "./modals/LogoutModal";
import useModalState from "@/hooks/useModalState";
import NotificationBell from "./enterprise/NotificationBell";
import BrandMark from "./enterprise/BrandMark";
import { FlagStripe } from "./enterprise/RalgaLogo";
import { NAVIGATION } from "@/lib/navigation";
import { useT } from "@/i18n";

const OPEN_KEY = "ims.nav.open";

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}

export default function DashboardSidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const { user }: any = useAuth();
  const { can, roles } = usePermissions();
  const { t } = useT();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readOpen);

  const groups = useMemo(
    () =>
      NAVIGATION.map((g) => ({
        ...g,
        label: t(`nav.group.${g.key}`, g.label),
        items: g.items
          .filter((i) => i.perms === "*" || can(i.perms))
          .map((i) => ({ ...i, label: t(`nav.${i.key}`, i.label) })),
      })).filter((g) => g.items.length),
    [can, t]
  );

  // The most specific link matching the current URL is highlighted (e.g. a Settings tab over "General settings").
  const activeLink = useMemo(() => {
    const links = groups.flatMap((g) => g.items.map((i) => i.link));
    return links
      .filter((l) => location.pathname === l || location.pathname.startsWith(`${l}/`))
      .sort((x, y) => y.length - x.length)[0];
  }, [groups, location.pathname]);
  const activeGroup = groups.find((g) => g.items.some((i) => i.link === activeLink))?.key;

  useEffect(() => {
    if (activeGroup && openGroups[activeGroup] === false) setOpenGroups((o) => ({ ...o, [activeGroup]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

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
  const roleNames = (roles.length ? roles.map((r) => r.name) : [user?.role?.name]).filter(Boolean);

  return (
    <Fragment>
      {user && (
        <>
          {open && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden />}
          <nav
            aria-label="Main navigation"
            className={cn(
              "fixed z-50 flex h-dvh w-[280px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
              open ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <FlagStripe />
            <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
              <Link to="/dashboard" className="flex min-w-0" aria-label="Dashboard">
                <BrandMark size="nav" />
              </Link>
              <NotificationBell className="hidden lg:flex" />
            </div>
            <div className="px-3 pb-2">
              <label className="relative block">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("common.jumpTo")}
                  aria-label={t("common.jumpTo")}
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-7 text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700">
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>

            <ScrollArea className="h-full w-full border-t border-slate-200 pt-1">
              {visible.map((group) => {
                const isOpen = q ? true : openGroups[group.key] !== undefined ? openGroups[group.key] : group.key === "overview" || group.key === activeGroup;
                return (
                  <div key={group.key} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => toggle(group.key, isOpen)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
                    >
                      {group.label}
                      <ChevronDown size={13} className={cn("transition-transform", !isOpen && "-rotate-90")} />
                    </button>
                    {isOpen && (
                      <div className="mx-2 space-y-[2px] pb-1">
                        {group.items.map((link) => {
                          const isActive = link.link === activeLink;
                          return (
                            <Link
                              to={link.link}
                              key={link.key}
                              aria-current={isActive ? "page" : undefined}
                              className={cn(
                                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                                isActive ? "bg-ralga-navy/[0.07] font-semibold text-ralga-navy" : "text-slate-600 hover:bg-slate-100 hover:text-ralga-navy"
                              )}
                            >
                              {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ralga-sky" />}
                              <link.icon size={17} className={cn("shrink-0", isActive ? "text-ralga-navy" : "text-slate-400 group-hover:text-ralga-navy")} />
                              <span className="truncate">{link.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {!visible.length && <p className="px-4 py-6 text-center text-[12.5px] text-slate-500">{t("common.noResults")}</p>}
            </ScrollArea>

            <div className="relative border-t border-slate-200 bg-white">
              <ProfileDropdown onLogout={() => logoutModal.open()} close={() => setshowProfile(false)} open={showProfile} />
              <div className="px-2 py-2">
                <button
                  type="button"
                  onClick={() => setshowProfile(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-100"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={user?.names || ""} path={user?.photo} className="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold capitalize text-slate-800">{user?.names}</span>
                      <span className="block truncate text-[11.5px] font-medium text-slate-500" title={roleNames.join(", ")}>
                        {roleNames[0] || "User"}
                        {roleNames.length > 1 && <span className="text-slate-400"> +{roleNames.length - 1}</span>}
                      </span>
                    </span>
                  </span>
                  <ChevronsUpDown size={15} className="shrink-0 text-slate-400" />
                </button>
              </div>
            </div>
          </nav>
        </>
      )}

      <LogoutModal onClose={() => logoutModal.close()} open={logoutModal.isOpen} />
    </Fragment>
  );
}
