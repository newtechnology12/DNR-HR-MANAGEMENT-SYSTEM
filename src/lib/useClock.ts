/**
 * Today's clock-in for the signed-in person, and clocking in / out with the organisation's rules
 * (working day, earliest clock-in time, location). Shared by the dashboard and My attendance; the server
 * stamps the time and checks that people only clock in for themselves.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import useSettings from "@/hooks/useSettings";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const timeOn = (hhmm: string | undefined, date = new Date()) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h)) return null;
  const d = new Date(date);
  d.setHours(h, m || 0, 0, 0);
  return d;
};

function position(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot share your location; use another browser to clock in."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => reject(new Error("Allow location access in your browser to clock in.")),
      { timeout: 15000, maximumAge: 60000 }
    );
  });
}

async function placeName(latitude: number, longitude: number) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}&language=en`);
    const data = await r.json();
    const first = data?.results?.[0];
    const part = (types: string[]) => first?.address_components?.find((c: any) => types.some((t) => c.types.includes(t)))?.long_name;
    return part(["establishment", "point_of_interest"]) || part(["premise"]) || first?.formatted_address?.split(",")[0] || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  } catch {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
}

export function useClock() {
  const { user }: any = useAuth();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const uid: string = user?.id || "";
  const [busy, setBusy] = React.useState(false);
  const today = useQuery(
    ["clock-today", uid],
    async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 864e5 - 1);
      const rows = await pocketbase.collection("attendance").getList(1, 1, { filter: `employee = "${uid}" && date >= "${start.toISOString().replace("T", " ")}" && date <= "${end.toISOString().replace("T", " ")}" && type != "correction"`, sort: "-created" });
      return rows.items[0] || null;
    },
    { enabled: Boolean(uid), refetchInterval: 60_000 }
  );
  const working: string[] = settings?.working_days?.length ? settings.working_days : ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const isWorkingDay = working.includes(DAY_NAMES[new Date().getDay()]);
  const record: any = today.data;
  const state: "out" | "in" | "done" = !record ? "out" : record.clockout_time ? "done" : "in";

  const refresh = () => {
    queryClient.invalidateQueries(["clock-today", uid]);
    queryClient.invalidateQueries(["my-dashboard"]);
    queryClient.invalidateQueries(["employee-attendance"]);
    queryClient.invalidateQueries(["my-attendance"]);
  };

  async function clockIn() {
    if (!isWorkingDay) return toast.error("Today is not a working day.");
    const start = timeOn(settings?.work_start_time);
    const earliest = start ? new Date(start.getTime() - (Number(settings?.early_clockin_mins) || 0) * 60000) : null;
    if (earliest && new Date() < earliest) return toast.error(`Clock-in opens at ${earliest.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
    setBusy(true);
    try {
      const pos = await position();
      const now = new Date();
      await pocketbase.collection("attendance").create({
        employee: uid, clockin_time: now, type: "manual", behaviour: start && now > start ? "late" : "early", date: now, branch: user?.branch,
        clockin_location: await placeName(pos.latitude, pos.longitude),
      });
      toast.success(start && now > start ? "Clocked in (after the start time)" : "Clocked in — have a good day");
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.message || e?.message || "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    if (!record) return;
    setBusy(true);
    try {
      const pos = await position().catch(() => null);
      await pocketbase.collection("attendance").update(record.id, { clockout_time: new Date(), clockout_location: pos ? await placeName(pos.latitude, pos.longitude) : "" });
      toast.success("Clocked out — see you tomorrow");
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.message || e?.message || "Could not clock out.");
    } finally {
      setBusy(false);
    }
  }

  return { record, state, loading: today.isLoading, busy, isWorkingDay, settings, clockIn, clockOut };
}
