import { Fragment, useRef } from "react";
import { Transition } from "@headlessui/react";
import { LogOut, ShieldCheck, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useClickAway } from "react-use";
import { useAuth, usePermissions } from "@/context/auth.context";
import { LANGUAGES, useT } from "@/i18n";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import Avatar from "./shared/Avatar";

/** Profile menu: every role the person holds, language, account & security, sign out. */
function ProfileDropdown({ open = false, onLogout, close }) {
  const navigate = useNavigate();
  const { user }: any = useAuth();
  const { roles, me } = usePermissions();
  const { t, lang, setLang } = useT();
  const ref = useRef(null);
  useClickAway(ref, () => close());

  const chooseLanguage = (code: "en" | "fr" | "rw") => {
    setLang(code);
    const id = (pocketbase.authStore.model as any)?.id;
    if (id) pocketbase.collection("users").update(id, { language: code }).catch(() => null);
  };

  const actions = [
    { title: t("nav.account"), icon: User, onclick: () => navigate("/dashboard/settings/account-settings") },
    { title: t("common.signOut"), icon: LogOut, onclick: () => onLogout() },
  ];

  return (
    <Transition
      show={open}
      as={Fragment}
      enter="transition ease-out duration-100"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
    >
      <div ref={ref} className="absolute bottom-[64px] left-2 right-2 z-50 rounded-xl border border-slate-200 bg-white shadow-modal">
        <div className="border-b border-slate-100 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar path={user?.photo} name={user?.names || ""} />
            <div className="min-w-0">
              <h4 className="truncate text-[13px] font-semibold capitalize text-slate-800">{user?.names}</h4>
              <p className="truncate text-[11.5px] text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1">
            {(roles.length ? roles : [{ id: "r", name: user?.role?.name, code: "" }]).map((r) => (
              <span key={r.id} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primaryDark">{r.name}</span>
            ))}
          </div>
          {me?.security && (
            <p className={cn("mt-2 flex items-center gap-1.5 text-[11.5px]", me.security.totp_enabled ? "text-emerald-700" : "text-slate-500")}>
              <ShieldCheck size={13} /> {me.security.totp_enabled ? "Two-factor authentication on" : "Two-factor authentication off"}
            </p>
          )}
        </div>
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("common.language")}</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => chooseLanguage(l.code)}
                className={cn("h-7 rounded-md text-[12px] font-medium", lang === l.code ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="p-1.5">
          {actions.map((item) => (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => {
                  item.onclick();
                  close();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-100"
              >
                <item.icon size={15} className="text-slate-500" />
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Transition>
  );
}

export default ProfileDropdown;
