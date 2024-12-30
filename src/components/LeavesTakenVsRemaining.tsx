import { cn } from "@/utils";

import { useMemo } from "react";
import { useQuery } from "react-query";
import { Cell, Pie, PieChart } from "recharts";
import useSettings from "@/hooks/useSettings";
import calculateRemainingLeaves from "@/utils/calculateRemainingLeaves";

function LeavesTakenVsRemaining({ employee }) {
  const { settings } = useSettings();
  const leaves_per_year = settings?.leaves_per_year || 0;

  async function fetchData() {
    const data = await calculateRemainingLeaves({
      employee,
      leaves_per_year,
    });
    return data;
  }

  const {
    data: analytics,
    status,
    error,
  } = useQuery(["my-leaves-analytics", employee?.id], fetchData, {
    keepPreviousData: true,
    retry: false,
    staleTime: Infinity,
    enabled: Boolean(employee?.id) && Boolean(leaves_per_year),
  });
  const data = useMemo(
    () => [
      {
        name: "Taken",
        value: Number(analytics?.taken) || 0,
        color: "#00C49F",
      },
      {
        name: "Remaining",
        value: Number(analytics?.remaining) || 0,
        color: "#cbd5e1",
      },
    ],
    [analytics]
  );

  return (
    <>
      <div className={cn("flex flex-col items-center h-full justify-evenly")}>
        {status === "loading" && (
          <div className="w-full flex h-full justify-center items-center">
            <div className="h-[170px] animate-pulse flex items-center relative  justify-center w-[170px] bg-slate-200 rounded-full">
              <div className="h-[130px] w-[130px] bg-white rounded-full"></div>
              <div className="w-[100px] right-0 bg-white h-[7px] absolute"></div>
            </div>
          </div>
        )}
        {status === "success" && (
          <>
            {" "}
            <PieChart
              className={cn({
                hidden: !analytics,
              })}
              width={200}
              height={200}
            >
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={1}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={data.map((e) => e.color)[index % data.length]}
                  />
                ))}
              </Pie>
            </PieChart>
            <div className="flex mt-3 ml-3 items-center justify-center gap-4">
              {data.map((item, index) => {
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between mt-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-6 rounded-md"
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-[13px] text-slate-600 capitalize font-medium">
                        {item.name}({item.value})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {status === "error" && (
        <div className="flex items-center justify-center h-full">
          <span className="text-[13px] font-medium text-slate-500">
            {error["message"] || "Something went wrong"}
          </span>
        </div>
      )}
    </>
  );
}

export default LeavesTakenVsRemaining;
