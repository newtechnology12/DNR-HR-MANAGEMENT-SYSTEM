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
            "h-[38px] w-full justify-start rounded-md border-slate-300 px-3 text-left text-[13.5px] font-normal text-slate-900 shadow-sm hover:border-slate-400 hover:bg-white focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 focus-visible:ring-offset-0",
            !value && "text-muted-foreground",
            {
              "border-red-500 ring-[3px] ring-red-500/15": error,
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
