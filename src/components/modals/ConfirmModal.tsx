import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "../ui/button";
import Loader from "../icons/Loader";
import { Alert, AlertTitle } from "../ui/alert";
import { AlertCircleIcon } from "lucide-react";

export default function ConfirmModal({
  open,
  onClose,
  title,
  description,
  isLoading,
  onConfirm,
  meta,
  error,
}: any) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-7">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert
            variant="destructive"
            className="py-2 -mt-2 rounded-[4px] flex items-center"
          >
            <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
            <AlertTitle className="text-[13px] font-medium fon !m-0">
              {error}
            </AlertTitle>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={isLoading}
            size="sm"
            variant="destructive"
            onClick={() => onConfirm(meta)}
          >
            {isLoading && (
              <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
            )}
            Yes, I cofirm
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
