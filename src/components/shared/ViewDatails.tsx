import { cn } from "@/utils";
import { DialogTrigger } from "../ui/dialog";
import { DrawerTrigger } from "../ui/drawer";
import { AlertDialogCancel } from "@radix-ui/react-alert-dialog";

export default function ViewDatails({
  isDesktop,
}: {
  status: "Queue" | "Cooking" | "Ready" | "Completed" | "Canceled";
  isDesktop: boolean;
  id?: number;
}) {
  if (isDesktop) {
    return (
      <AlertDialogCancel>
        <DialogTrigger>
          <button
            className={cn(
              "my-2 inline-flex flex-1 items-center justify-center whitespace-nowrap bg-cyan-500 hover:bg-opacity-80 rounded-sm text-[12px] font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-slate-300 text-slate-50 px-4 py-2 w-full"
            )}
          >
            View Datails
          </button>
        </DialogTrigger>
      </AlertDialogCancel>
    );
  }
  return (
    <DrawerTrigger>
      <AlertDialogCancel>
        <button
          className={cn(
            "my-2 inline-flex flex-1 items-center justify-center whitespace-nowrap bg-cyan-500 hover:bg-opacity-80 rounded-sm text-[12px] font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-slate-300 text-slate-50 px-4 py-2 w-full"
          )}
        >
          View Datails
        </button>
      </AlertDialogCancel>
    </DrawerTrigger>
  );
}
