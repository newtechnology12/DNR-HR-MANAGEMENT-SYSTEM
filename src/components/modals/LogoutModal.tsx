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
import useLoadingState from "@/hooks/useLoadingState";
import authService from "@/services/auth.service";
import Loader from "../icons/Loader";
import { useNavigate } from "react-router-dom";

export default function LogoutModal({ open, onClose }) {
  const navigate = useNavigate();
  const loader = useLoadingState();
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
          <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-7">
            This action cannot be undone. This will permanently logout your
            account and remove your data from this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={loader.isLoading}
            size="sm"
            variant="destructive"
            onClick={() => {
              loader.start();
              setTimeout(() => {
                return authService.logout().then(() => {
                  navigate("/");
                  loader.stop();
                });
              }, 1000);
            }}
          >
            {loader.isLoading && (
              <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
            )}
            Yes, Logout
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
