import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils";

const DOT: Record<string, string> = {
  approval: "bg-amber-500",
  success: "bg-emerald-500",
  error: "bg-red-500",
  warning: "bg-violet-500",
  info: "bg-blue-500",
};

/** In-app notification centre. Notifications are created only by server hooks. */
export default function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = pocketbase.authStore.model as any;
  const [open, setOpen] = React.useState(false);

  const q = useQuery(
    ["notifications"],
    async () => {
      const [unread, latest] = await Promise.all([
        pocketbase.collection("notifications").getList(1, 1, { filter: "read = false", fields: "id" }).then((r) => r.totalItems),
        pocketbase.collection("notifications").getList(1, 15, { sort: "-created" }).then((r) => r.items),
      ]);
      return { unread, latest };
    },
    { enabled: Boolean(me?.id), refetchInterval: 30_000 }
  );

  // Live updates: refresh as soon as the server creates a notification for this user.
  React.useEffect(() => {
    if (!me?.id) return;
    let unsub: (() => void) | undefined;
    pocketbase
      .collection("notifications")
      .subscribe("*", () => queryClient.invalidateQueries(["notifications"]))
      .then((u) => (unsub = u))
      .catch(() => undefined);
    return () => unsub?.();
  }, [me?.id]);

  const markRead = async (ids: string[]) => {
    await Promise.all(ids.map((id) => pocketbase.collection("notifications").update(id, { read: true }).catch(() => undefined)));
    queryClient.invalidateQueries(["notifications"]);
  };

  const unread = q.data?.unread || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn("relative flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100", className)}
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] bg-white p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-slate-900">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead((q.data?.latest || []).filter((n: any) => !n.read).map((n: any) => n.id))}
              className="flex items-center gap-1 text-[12px] font-medium text-primaryDark hover:underline"
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto">
          {!q.data?.latest.length && <li className="px-3 py-8 text-center text-[13px] text-slate-500">You're all caught up.</li>}
          {q.data?.latest.map((n: any) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  if (!n.read) markRead([n.id]);
                  setOpen(false);
                  if (n.link) navigate(n.link);
                }}
                className={cn("flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50", !n.read && "bg-blue-50/40")}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-slate-200" : DOT[n.type] || DOT.info)} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px]", n.read ? "text-slate-600" : "font-medium text-slate-900")}>{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-[12px] text-slate-500">{n.body}</span>}
                  <span className="block text-[11px] text-slate-400">{formatDistanceToNow(new Date(n.created), { addSuffix: true })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
