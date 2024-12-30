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

async function calculateRemainingLeaves({ employee, leaves_per_year }: CalculateRemainingLeavesParams) {
  try {
    const joinDate = new Date(employee.joined_at);
    const leaves_taken: Leave[] = await pocketbase.collection("leaves").getFullList({
      filter: `employee="${employee.id}" && status="approved" && type="annual" && start >= "${joinDate.toISOString()}"`,
    });

    const total_days = leaves_taken.reduce((acc, item) => acc + item.days, 0);

    const leaves_per_month = leaves_per_year / 12;
    const today = new Date();

    const months = (today.getFullYear() - joinDate.getFullYear()) * 12 + today.getMonth() - joinDate.getMonth() + 1;

    const totalLeaves = months * leaves_per_month;
    const remainingLeaves = totalLeaves - total_days;

    return {
      taken: total_days,
      remaining: Math.floor(remainingLeaves),
    };
  } catch (error) {
    console.error("Error calculating remaining leaves:", error);
    return {
      taken: 0,
      remaining: 0,
    };
  }
}

export default calculateRemainingLeaves;