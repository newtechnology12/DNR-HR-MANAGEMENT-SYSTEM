import pocketbase from "@/lib/pocketbase";

type Employee = {
  id: string;
  joined_at: string;
};

type CalculateRemainingLeavesParams = {
  employee: Employee;
  leaves_per_year: number;
};

type Leave = {
  days: number;
};

/**
 * Annual leave balance for the current calendar year: entitlement accrues monthly from 1 January
 * (or the joining date, if later); approved annual leave taken this year is deducted.
 */
async function calculateRemainingLeaves({ employee, leaves_per_year }: CalculateRemainingLeavesParams) {
  try {
    const today = new Date();
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const joined = employee.joined_at ? new Date(employee.joined_at) : yearStart;
    const from = joined > yearStart ? joined : yearStart;
    const pbDate = (d: Date) => d.toISOString().replace("T", " ");

    const leaves_taken: Leave[] = await pocketbase.collection("leaves").getFullList({
      filter: `employee="${employee.id}" && status="approved" && (type="Annual Leave" || type="annual") && start >= "${pbDate(yearStart)}"`,
      fields: "days",
    });
    const total_days = leaves_taken.reduce((acc, item) => acc + (Number(item.days) || 0), 0);

    const months = Math.max(0, (today.getFullYear() - from.getFullYear()) * 12 + today.getMonth() - from.getMonth() + 1);
    const accrued = Math.min(leaves_per_year, (months * leaves_per_year) / 12);

    return {
      taken: total_days,
      remaining: Math.max(0, Math.floor(accrued - total_days)),
      entitlement: leaves_per_year,
    };
  } catch (error) {
    console.error("Error calculating remaining leaves:", error);
    return {
      taken: 0,
      remaining: 0,
      entitlement: leaves_per_year,
    };
  }
}

export default calculateRemainingLeaves;
