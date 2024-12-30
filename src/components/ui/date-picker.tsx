"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DatePicker({ value, setValue, placeholder, error = false }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full rounded-[3px] h-[40px] justify-start text-left font-normal",
            !value && "text-muted-foreground",
            {
              "border-red-500": error,
            }
          )}
        >
          <CalendarIcon className="mr-3 h-4 w-4" />
          {value ? (
            format(value, "PPP")
          ) : (
            <span className="text-slate-500 text-[13px] ">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto bg-white p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={setValue}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
