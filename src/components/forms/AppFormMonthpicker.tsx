import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Label } from "../ui/label";
import "react-month-picker/css/month-picker.css";
import { cn } from "@/utils";
import { useState } from "react";

export default function AppFormMonthPicker({ name, form, label }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>
            <Label className="text-[13px] mb-1 text-slate-600" htmlFor={label}>
              {label}
            </Label>
          </FormLabel>
          <FormControl>
            <MonthPicker
              error={fieldState?.error?.message}
              value={field?.value}
              onChange={(e) => field.onChange(e)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const MonthPicker = ({ error, value, onChange }) => {
  // value is like 2014.11
  const selectedMonth = value.split(".")[1];
  const selectedYear = value.split(".")[0];
  // Function to handle month selection
  const handleMonthChange = (e) => {
    const newMonth = e.target.value;
    const newYear = selectedYear;

    onChange(`${newYear}.${newMonth}`);
  };

  // Function to handle year selection
  const handleYearChange = (e) => {
    const newMonth = selectedMonth || 1;
    const newYear = e.target.value;

    onChange(`${newYear}.${newMonth}`);
  };

  // Function to generate options for months (1 to 12)
  const generateMonthOptions = () => {
    const months = [];
    for (let i = 1; i <= 12; i++) {
      months.push(
        <option key={i} value={i}>
          {new Date(2000, i - 1, 1).toLocaleString("default", {
            month: "long",
          })}
        </option>
      );
    }
    return months;
  };

  // Function to generate options for years (current year - 10 to current year + 10)
  const generateYearOptions = () => {
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 5; i <= currentYear + 10; i++) {
      years.push(
        <option key={i} value={i}>
          {i}
        </option>
      );
    }
    return years;
  };

  console.log("selectedMonth", selectedMonth);

  return (
    <div
      className={cn(
        "flex pr-2 rounded-[4px] overflow-hidden items-center border space-x-4-",
        {
          "border-red-500": error,
        }
      )}
    >
      <div className="pr-2 border-r">
        <select
          // disabled
          className="px-3 text-slate-500  py-[10px] text-sm select rounded-none"
          value={selectedYear || ""}
          onChange={handleYearChange}
        >
          <option value="">Select Year</option>
          {generateYearOptions()}
        </select>
      </div>
      <select
        className="px-3 py-[10px] text-slate-500 text-sm select flex-1 rounded-none"
        value={selectedMonth || ""}
        onChange={handleMonthChange}
      >
        <option value="">Select Month</option>
        {generateMonthOptions()}
      </select>
    </div>
  );
};
