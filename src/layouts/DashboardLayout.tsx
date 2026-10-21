import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Menu, TimerReset } from "lucide-react";
import { toast } from "sonner";
import NotificationBell from "@/components/enterprise/NotificationBell";
import BrandMark from "@/components/enterprise/BrandMark";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/auth.context";
import authService from "@/services/auth.service";
import pocketbase from "@/lib/pocketbase";
import { useT } from "@/i18n";

const WARN_SECONDS = 60;
const ACCOUNT_PATH = "/dashboard/settings/account-settings";

/**
 * Signs the person out after `minutes` without activity (settings.session_timeout_minutes),
 * with a one-minute warning. Activity in any open tab counts.
 */
function useIdleTimeout(minutes: number | undefined, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const last = useRef(Date.now());
  const touch = useCallback(() => {
    last.current = Date.now();
    try {
      localStorage.setItem("ims.lastActivity", String(last.current));
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!minutes) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    const onActivity = () => {
      if (secondsLeft === null) touch();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = window.setInterval(() => {
      let shared = last.current;
      try {
        shared = Math.max(shared, Number(localStorage.getItem("ims.lastActivity")) || 0);
      } catch (_) {}
      const remaining = Math.round((shared + minutes * 60_000 - Date.now()) / 1000);
      if (remaining <= 0) {
        window.clearInterval(timer);
        onTimeout();
      } else if (remaining <= WARN_SECONDS) setSecondsLeft(remaining);
      else setSecondsLeft(null);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [minutes, onTimeout, touch, secondsLeft]);

  const stay = useCallback(() => {
    touch();
    setSecondsLeft(null);
    pocketbase.collection("users").authRefresh().catch(() => null);
  }, [touch]);
  return { secondsLeft, stay };
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { me } = useAuth();
  const { t } = useT();

  // Close the mobile drawer after navigating.
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const signOut = useCallback(() => {
    authService.logout();
    toast.info(t("session.ended"));
  }, [t]);
  const { secondsLeft, stay } = useIdleTimeout(me?.session_timeout_minutes, signOut);

  // Security policy: roles that must use 2FA are sent to set it up before anything else.
  if (me?.security?.must_enroll_2fa && !location.pathname.startsWith(ACCOUNT_PATH)) {
    return <Navigate to={`${ACCOUNT_PATH}?tab=security&required=1`} replace />;
  }

  return (
    <>
      <DashboardSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        >
          <Menu size={20} />
        </button>
        <Link to="/dashboard" aria-label="Dashboard">
          <BrandMark compact />
        </Link>
        <NotificationBell className="ml-auto" />
      </header>
      <div className="lg:pl-[280px]">
        <div className="mx-auto max-w-7xl py-3">
          <Suspense
            fallback={
              <div className="space-y-4 px-4 py-4 sm:px-6" aria-busy="true">
                <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
                <div className="h-40 w-full animate-pulse rounded-lg bg-slate-100" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>

      <Dialog open={secondsLeft !== null} onOpenChange={(o) => !o && stay()}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <TimerReset size={20} />
            </span>
            <DialogTitle>{t("session.expiringTitle")}</DialogTitle>
            <DialogDescription>
              {t("session.expiringText")} <span className="font-semibold tabular-nums text-slate-900">{secondsLeft}s</span>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={signOut} className="h-10 flex-1 rounded-md border border-slate-200 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50">
              {t("common.signOut")}
            </button>
            <button type="button" onClick={stay} className="h-10 flex-1 rounded-md bg-primary text-[13.5px] font-semibold text-white hover:bg-primaryDark">
              {t("session.stay")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
