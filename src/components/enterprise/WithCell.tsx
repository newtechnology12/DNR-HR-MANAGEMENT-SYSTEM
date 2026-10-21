/**
 * "With" column of approval tables: who must act now. Turns the comma-separated user ids that the
 * approval engine stores (pending_approvers) into names, from one cached read of the staff directory.
 */
import * as React from "react";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import { Person } from "@/components/ims";

type Directory = Record<string, { name: string; designation?: string }>;

export function useDirectory() {
  return useQuery(
    ["staff-directory"],
    async () => {
      const rows = await pocketbase.collection("users").getFullList({ fields: "id,name,expand.designation.name", expand: "designation", batch: 500 });
      return Object.fromEntries(rows.map((u: any) => [u.id, { name: u.name, designation: u.expand?.designation?.name }])) as Directory;
    },
    { staleTime: 10 * 60_000 }
  );
}

/** Names of the people with the document now; "—" when nobody needs to act. */
export function WithPeople({ ids, fallback }: { ids?: string | string[] | null; fallback?: React.ReactNode }) {
  const dir = useDirectory();
  const list = (Array.isArray(ids) ? ids : String(ids || "").split(",")).map((x) => x.trim()).filter(Boolean);
  if (!list.length) return <>{fallback ?? <span className="text-ims-faint">—</span>}</>;
  const first = dir.data?.[list[0]];
  const more = list.length - 1;
  return <Person name={first?.name || "…"} detail={more > 0 ? `and ${more} other${more === 1 ? "" : "s"}` : first?.designation} />;
}
