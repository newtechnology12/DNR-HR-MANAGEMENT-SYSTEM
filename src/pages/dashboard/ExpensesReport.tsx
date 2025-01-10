import CalendarDateRangePicker from "@/components/CalendarDateRangePicker";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import getDaf from "@/utils/getDaf";
import { addDays } from "date-fns";
import { useState } from "react";
import { ChevronDown } from "react-feather";
import { useQuery } from "react-query";

export default function ExpensesReport() {
  const [date, setDate] = useState({
    from: new Date(),
    to: new Date(),
  });

  const analyticsQuery = useQuery({
    queryKey: [
      "expenses-report",
      {
        date,
      },
    ],
    queryFn: async () => {
      const expenses = await pocketbase.collection("prepayments").getFullList({
        filter: getDaf(date),
      });

      const expenses_categories = await pocketbase
        .collection("expenses_categories")
        .getFullList();

      const reports = expenses_categories.map((category) => {
        const totalAmount = expenses
          .filter((e) => e.expenseCategory === category.id)
          .reduce((acc, e) => acc + e.amount, 0);
        return {
          category: category.name,
          totalAmount,
        };
      });

      const total_row = {
        category: "Total",
        totalAmount: reports.reduce((acc, e) => acc + e.totalAmount, 0),
        isMain: true,
      };
      return {
        expenses_reports: [...reports, total_row],
      };
    },
    enabled: true,
  });

  console.log(analyticsQuery?.data);

  const presets = [
    {
      label: "Today",
      value: {
        from: new Date(),
        to: new Date(),
      },
    },
    {
      label: "Yesterday",
      value: {
        from: addDays(new Date(), -1),
        to: addDays(new Date(), -1),
      },
    },
    {
      label: "Last 7 days",
      value: {
        from: addDays(new Date(), -7),
        to: new Date(),
      },
    },
    {
      label: "Last 30 days",
      value: {
        from: addDays(new Date(), -30),
        to: new Date(),
      },
    },
    {
      label: "This month",
      value: {
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        to: new Date(),
      },
    },
    {
      label: "Last month",
      value: {
        from: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
        to: new Date(new Date().getFullYear(), new Date().getMonth(), 0),
      },
    },
  ];

  const activePreset = presets.find((e) => {
    return (
      e.value.from.toDateString() === date.from.toDateString() &&
      e.value.to?.toDateString() === date.to?.toDateString()
    );
  });
  return (
    <div className="sm:px-4 px-2">
      <div className="flex flex-col mb-4 sm:flex-row sm:gap-0 sm:items-center gap-3 items-start justify-between space-y-2 mb-3">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-base font-semibold tracking-tight">
            Expenses Report
          </h2>
          <BreadCrumb
            items={[{ title: "Expenses Report", link: "/dashboard" }]}
          />
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button className="" variant="outline">
                {activePreset?.label || "Choose date ranges"}
                <ChevronDown size={16} className="ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {presets.map((preset) => (
                <DropdownMenuItem
                  onClick={() => {
                    setDate(preset.value);
                  }}
                >
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <CalendarDateRangePicker date={date} setDate={setDate} />
        </div>
      </div>
      <div className="mt-2">
        <div>
          <h4 className="text-[15px] font-semibold">
            Expenses Report by categories.
          </h4>
        </div>
        <div className="bg-white mt-3">
          <table className="w-full border">
            <tr className="text-left text-[11px] bg-slate-50 font-medium uppercase">
              <th className="py-3 border-r border-b px-3">Category</th>
              <th className="py-3 border-b px-3">Total Amount</th>
            </tr>

            {analyticsQuery?.data?.expenses_reports?.map((e: any) => (
              <tr>
                <td className="py-[12px] px-3 border-r border-b">
                  <span className="text-[13px] font-medium">{e.category}</span>
                </td>
                <td
                  className={cn(
                    "py-[6px] text-[13px] text-slate-700 px-3 border-b font-medium",
                    {
                      "text-green-500 font-semibold": e.isMain,
                    }
                  )}
                >
                  {e?.totalAmount?.toLocaleString()} FRW
                </td>
              </tr>
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}
