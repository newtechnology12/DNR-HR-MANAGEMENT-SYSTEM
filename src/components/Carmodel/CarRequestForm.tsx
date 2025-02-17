import { useMemo, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader } from "lucide-react";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import AppFormField from "../forms/AppFormField";
import AppFormDatePicker from "../forms/AppFormDatepicker";
import { useAuth } from "@/context/auth.context";

const formSchema = z.object({
  employee: z.string().min(1, "Employee is required"),
  car: z.string().min(1, "Car is required"),
  fromLocation: z.string().min(1, "From location is required"),
  toLocation: z.string().min(1, "To location is required"),
  purpose: z.string().min(1, "Purpose is required"),
  startTime: z.date().min(new Date(), "Start time is required"),
  endTime: z.date().min(new Date(), "End time is required"),
  passengerCount: z.coerce.number().min(1, "At least 1 passenger required"),
  needsDriver: z.enum(["true", "false"]),
});

export function CarRequestForm({
  open,
  setOpen,
  record,
  onRequestCreated,
  employeeId,
}: any) {
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee: employeeId || user?.id || "",
      car: "",
      fromLocation: "",
      toLocation: "",
      purpose: "",
      startTime: new Date(), // Set default start time to current date and time
      endTime: new Date(), // Set default end time to current date and time
      passengerCount: 1,
      needsDriver: "true",
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  async function handleSubmit(data: z.infer<typeof formSchema>) {
    try {
      const newRequest = await pocketbase.collection("CarRequests").create({
        ...data,
        status: "PENDING",
        needsDriver: data.needsDriver === "true",
      });

      toast.success("Car request submitted successfully");
      onRequestCreated?.(newRequest);
      form.reset();
      setOpen(false);
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.data?.message || "Failed to submit request");
    }
  }

  const employeesLoader = useCallback(async ({ search }: { search?: string }) => {
    try {
      const response = await pocketbase.collection("users").getList(1, 5, {
        filter: search ? `name~"${search}"` : "",
      });

      return response.items.map((e) => ({
        label: e.name,
        value: e.id,
      }));
    } catch (error) {
      console.error("Error fetching employees:", error);
      return []; // Return an empty array on error
    }
  }, []);

  const carsLoader = useCallback(async ({ search }: { search?: string }) => {
    try {
      const response = await pocketbase.collection("Car").getList(1, 5, {
        filter: search ? `carName~"${search}"` : "",
      });

      return response.items.map((e) => ({
        label: e.carName,
        value: e.id,
      }));
    } catch (error) {
      console.error("Error fetching Car:", error);
      return []; // Return an empty array on error
    }
  }, []);

  const driverOptions = useMemo(
    () => [
      { value: "true", label: "Yes" },
      { value: "false", label: "No (Self-drive)" },
    ],
    []
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : "Create a new"} Car Request.
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "Update" : "Create a new"} Car.
            </span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4">
              <AppFormAsyncSelect
                form={form}
                name="employee"
                label="Assign Employee"
                placeholder="Select employee"
                loader={employeesLoader}
                isDisabled={!!employeeId}
              />

              <AppFormAsyncSelect
                form={form}
                name="car"
                label="Select Vehicle"
                placeholder="Choose vehicle"
                loader={carsLoader}
              />

              <div className="grid grid-cols-2 gap-4">
                <AppFormField
                  form={form}
                  name="fromLocation"
                  label="Departure Location"
                  placeholder="Enter pickup location"
                />
                <AppFormField
                  form={form}
                  name="toLocation"
                  label="Destination"
                  placeholder="Enter drop-off location"
                />
              </div>

              <AppFormField
                form={form}
                name="purpose"
                label="Trip Purpose"
                placeholder="Describe the purpose of the trip"
              />

              <div className="grid grid-cols-2 gap-4">
                <AppFormDatePicker
                  form={form}
                  name="startTime"
                  label="Start Date & Time"
                  placeholder="Select start date & time"
                />
                <AppFormDatePicker
                  form={form}
                  name="endTime"
                  label="End Date & Time"
                  placeholder="Select end date & time"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <AppFormField
                  form={form}
                  name="passengerCount"
                  label="Passenger Count"
                  type="number"
                  min={1}
                  placeholder="Enter number of passengers"
                />
                <AppFormAsyncSelect
                  form={form}
                  name="needsDriver"
                  label="Driver Required"
                  placeholder="Select driver option"
                  loader={async () => driverOptions}
                />
              </div>
            </div>

            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="button"
                  onClick={() => form.reset()}
                  className="w-full text-slate-600"
                  size="sm"
                  variant="outline"
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {record ? "Update department." : "Create new department"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}