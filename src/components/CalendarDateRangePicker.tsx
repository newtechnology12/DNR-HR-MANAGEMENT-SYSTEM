import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import "react-datepicker/dist/react-datepicker.css";
import DatePicker from "react-datepicker";

function CalendarDateRangePicker({ className, date, setDate }: any) {
  const { from, to } = date;

  const onChange = (dates) => {
    const [start, end] = dates;
    setDate({ from: start, to: end });
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-fit justify-start hover:bg-white text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto calender-range-picker bg-white p-0"
          align="end"
        >
          {/* <Calendar
            captionLayout="dropdown-buttons"
            fromYear={2015}
            toYear={2025}
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(e) => {
              if (e?.from) {
                setDate(e);
              }
            }}
            numberOfMonths={2}
          /> */}
          <DatePicker
            selected={from}
            onChange={onChange}
            startDate={from}
            endDate={to}
            // onClickOutside={() => setshowDatePicker(false)}
            // onSelect={() => setshowDatePicker(false)}
            selectsRange
            inline
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default CalendarDateRangePicker;
