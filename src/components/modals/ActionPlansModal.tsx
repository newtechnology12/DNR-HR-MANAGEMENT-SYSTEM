import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import Loader from "../icons/Loader";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useAuth } from "@/context/auth.context";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import AppFormSelect from "../forms/AppFormSelect";
import AppFormField from "../forms/AppFormField";
import AppFormDatePicker from "../forms/AppFormDatepicker";
import AppFormTimePicker from "../forms/AppFormTimePicker";

// Schema for Action Plans
const formSchema = z.object({
  planType: z.enum(["daily", "weekly", "monthly"]),
  title: z.string().min(1, "Title is required"),
  task_description: z.string().optional(),
  start_date: z.date({ required_error: "Start date is required" }),
  end_date: z.date({ required_error: "End date is required" }),
  deadline: z.date({ required_error: "Deadline is required" }),
  priority: z.enum(["high", "medium", "low"]),
  status: z.enum(["not_started", "in_progress", "completed"]),
  department_id: z.string().min(1, "Department is required"),
  staff_id: z.string().min(1, "Assigned to is required"),
  files: z.array(z.any()).optional(),
  hoursPerDay: z.array(
    z.object({
      date: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      hours: z.number(),
    })
  ).optional(),
});

// Default values function
const getDefaultValues = (data: any) => ({
  planType: data?.planType || "daily",
  title: data?.title || "",
  task_description: data?.task_description || "",
  start_date: data?.start_date ? new Date(data.start_date) : new Date(),
  end_date: data?.end_date ? new Date(data.end_date) : new Date(),
  deadline: data?.deadline ? new Date(data.deadline) : new Date(),
  priority: data?.priority || "medium",
  status: data?.status || "not_started",
  department_id: data?.department_id || "",
  staff_id: data?.staff_id || "",
  files: data?.files || [],
  hoursPerDay: data?.hoursPerDay || [],
});

export function ActionPlansModal({ open, setOpen, record, onComplete }: any) {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [hoursInput, setHoursInput] = useState({ date: "", startTime: "", endTime: "" });

  const values = useMemo(() => getDefaultValues(record), [record]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [record, values]);

  // Department loader for async select
  function departmentsLoader({ search }: { search: string }) {
    return pocketbase
      .collection("departments")
      .getFullList({
        filter: `name~"${search}"`,
      })
      .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
  }

  // Staff loader for async select
  function staffLoader({ search }: { search: string }) {
    return pocketbase
      .collection("users")
      .getFullList({
        filter: `name~"${search}"`,
      })
      .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
  }

  // Calculate hours from start and end time
  const calculateHours = (startTime: string, endTime: string) => {
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Difference in hours
    return Math.round(diff * 100) / 100; // Round to 2 decimal places
  };

  // Add hours to the task
  const handleAddHours = () => {
    const { date, startTime, endTime } = hoursInput;
    if (!date || !startTime || !endTime) {
      toast.error("Please fill all fields.");
      return;
    }

    const hours = calculateHours(startTime, endTime);
    const newHoursEntry = { date, startTime, endTime, hours };

    const currentHours = form.getValues("hoursPerDay") || [];
    form.setValue("hoursPerDay", [...currentHours, newHoursEntry]);
    setHoursInput({ date: "", startTime: "", endTime: "" });
    toast.success("Hours added successfully");
  };

  // Submit handler
  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("Form values on submit:", values);

    if (!values.title || !values.start_date || !values.end_date) {
      setError("Please fill all required fields.");
      toast.error("Please fill all required fields.");
      return;
    }

    const data = {
      ...values,
      start_date: values.start_date.toISOString(),
      end_date: values.end_date.toISOString(),
      deadline: values.deadline.toISOString(),
      createdBy: user?.id,
    };

    setError("");

    try {
      const q = !record
        ? pocketbase.collection("actionPlans").create(data)
        : pocketbase.collection("actionPlans").update(record.id, data);

      await q;
      onComplete();
      toast.success(record ? "Plan updated successfully" : "Plan created successfully");
      form.reset();
      setError(undefined);
      setOpen(false);
    } catch (e) {
      console.error("Submission error:", e);
      setError(e.message || "An error occurred while submitting the form.");
      toast.error(e.message || "An error occurred while submitting the form.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[750px]">
        <DialogHeader>
          <DialogTitle>{record ? "Update Action Plan" : "Create New Action Plan"}</DialogTitle>
          <DialogDescription>
            Define your daily, weekly, or monthly action plan.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="max-h-[60vh] overflow-y-auto pr-6">
              {error && (
                <div className="mb-3 px-2">
                  <Alert variant="destructive" className="py-2 mt-3 rounded-[4px] flex items-center">
                    <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                    <AlertTitle className="text-[13px] font-medium !m-0">{error}</AlertTitle>
                  </Alert>
                </div>
              )}

              <div className="grid gap-4">
                <AppFormSelect
                  form={form}
                  label="Plan Type"
                  name="planType"
                  options={[
                    { label: "Daily", value: "daily" },
                    { label: "Weekly", value: "weekly" },
                    { label: "Monthly", value: "monthly" },
                  ]}
                  placeholder="Select plan type"
                />

                <AppFormField
                  form={form}
                  label="Title"
                  name="title"
                  placeholder="Enter plan title"
                />

                <AppFormField
                  form={form}
                  label="Task Description"
                  name="task_description"
                  placeholder="Enter plan description"
                  as="textarea"
                />

                <div className="grid gap-4 grid-cols-2">
                  <AppFormDatePicker
                    form={form}
                    label="Start Date"
                    name="start_date"
                    placeholder="Select start date"
                  />
                  <AppFormDatePicker
                    form={form}
                    label="End Date"
                    name="end_date"
                    placeholder="Select end date"
                  />
                </div>

                <div className="grid gap-4 grid-cols-2">
                  <AppFormDatePicker
                    form={form}
                    label="Deadline"
                    name="deadline"
                    placeholder="Select deadline"
                  />
                </div>

                <div className="grid gap-4 grid-cols-2">
                  <AppFormSelect
                    form={form}
                    label="Priority"
                    name="priority"
                    options={[
                      { label: "High", value: "high" },
                      { label: "Medium", value: "medium" },
                      { label: "Low", value: "low" },
                    ]}
                    placeholder="Select priority"
                  />
                  <AppFormSelect
                    form={form}
                    label="Status"
                    name="status"
                    options={[
                      { label: "Not Started", value: "not_started" },
                      { label: "In Progress", value: "in_progress" },
                      { label: "Completed", value: "completed" },
                    ]}
                    placeholder="Select status"
                  />
                </div>

                <AppFormAsyncSelect
                  form={form}
                  name="department_id"
                  label="Department"
                  placeholder="Select department"
                  loader={departmentsLoader}
                />

                <AppFormAsyncSelect
                  form={form}
                  name="staff_id"
                  label="Staff Name"
                  placeholder="Select staff"
                  loader={staffLoader}
                />

                {/* Hours Per Day Section */}
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Add Hours Spent</h3>
                  <div className="grid gap-4 grid-cols-3">
                    <AppFormDatePicker
                      form={form}
                      label="Date"
                      name="hoursPerDay.date"
                      value={hoursInput.date}
                      onChange={(e) => setHoursInput({ ...hoursInput, date: e.target.value })}
                      placeholder={"Select date"}
                    />
                    <AppFormTimePicker
                      form={form}
                      label="Start Time"
                      name="hoursPerDay.startTime"
                      value={hoursInput.startTime}
                      onChange={(e) => setHoursInput({ ...hoursInput, startTime: e.target.value })}
                      placeholder={"Select start time"}
                    />
                    <AppFormTimePicker
                      form={form}
                      label="End Time"
                      name="hoursPerDay.endTime"
                      value={hoursInput.endTime}
                      onChange={(e) => setHoursInput({ ...hoursInput, endTime: e.target.value })}
                      placeholder={"Select end time"}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddHours}
                    className="mt-2"
                  >
                    Add Hours
                  </Button>
                </div>

                {/* Display Total Hours */}
                <div className="mt-4">
                  <h3 className="font-semibold">Total Hours Spent</h3>
                  <p>
                    {form.getValues("hoursPerDay")?.reduce((sum, entry) => sum + entry.hours, 0) || 0} hours
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="button"
                  onClick={() => {
                    form.reset(getDefaultValues({}));
                    setError("");
                  }}
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
                  {record ? "Update Plan" : "Create Plan"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default ActionPlansModal;