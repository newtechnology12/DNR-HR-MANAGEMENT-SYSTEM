import { Dialog, DialogClose, DialogContent } from "./ui/dialog";
import { Calendar } from "@/components/ui/calendar";

export default function CalendarModal({ open, setOpen, date, setdate }: any) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        {...{ hideCloseButton: true }}
        className="w-fit !pt-0 !pb-0 !px-0"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={setdate}
          onDayClick={() => {
            setTimeout(() => {
              setOpen(false);
            }, 200);
          }}
          className="rounded-md border"
        />
        <DialogClose asChild>j</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
