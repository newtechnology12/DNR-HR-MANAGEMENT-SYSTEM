/**
 * Fiscal-year helpers. RALGA runs July–June; the start month comes from the fiscal_years records
 * (Setup → Fiscal years), so nothing here assumes July except as a fallback before they load.
 * A year number like 2026 means the fiscal year that starts in 2026 (FY 2026/27).
 */
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface FiscalYear {
  id: string;
  name: string;
  status: string;
  is_current: boolean;
  /** Calendar year in which the fiscal year starts. */
  year: number;
  /** 1–12 */
  startMonth: number;
}

export const fyLabel = (year: number, startMonth = 7) => (startMonth === 1 ? `FY ${year}` : `FY ${year}/${String(year + 1).slice(2)}`);

/** The twelve months of a fiscal year in order, with calendar month number and label ("Jul 2026"). */
export function fyMonths(year: number, startMonth = 7) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const y = m >= startMonth ? year : year + 1;
    return { month: m, year: y, label: `${SHORT[m - 1]} ${y}` };
  });
}

export function useFiscalYears() {
  return useQuery(
    ["fiscal-years-lite"],
    async () =>
      (await pocketbase.collection("fiscal_years").getFullList({ sort: "-start_date" })).map(
        (f: any): FiscalYear => ({
          id: f.id, name: f.name, status: f.status, is_current: f.is_current,
          year: Number(String(f.start_date).slice(0, 4)), startMonth: Number(String(f.start_date).slice(5, 7)) || 7,
        })
      ),
    { staleTime: 10 * 60_000 }
  );
}
