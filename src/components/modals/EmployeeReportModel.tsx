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
import AppFormField from "../forms/AppFormField";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useAuth } from "@/context/auth.context";
import AppFormSelect from "../forms/AppFormSelect";
import AppFormDatePicker from "../forms/AppFormDatepicker";
import AppFormTextArea from "../forms/AppFormTextArea";
import AppFileUpload from "../forms/AppFileUpload";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";

// Define the form schema using Zod
const formSchema = z.object({
  reportType: z.string().min(1, { message: "Report type is required" }),
  employeeName: z.string().min(1, { message: "Employee name is required" }),
  department: z.string().min(1, { message: "Department is required" }),
  reportDate: z.date({ required_error: "Report date is required" }),
  dateHappened: z.date({ required_error: "Date happened is required" }),
  tasksCompleted: z.string().min(1, { message: "Tasks completed is required" }),
  challengesFaced: z.string().optional(),
  nextSteps: z.string().optional(),
  additionalComments: z.string().optional(),
  plane: z.string().optional(),
  fileUpload: z.union([z.instanceof(File), z.string()]).optional(), // File is optional
});

// Default values for the form
const getDefaultValues = (data?: any, user?: any) => {
  return {
    reportType: data?.reportType || "",
    employeeName: user?.names || "", // Auto-populate with logged-in user's name
    department: user?.department || "", // Auto-populate with logged-in user's department
    reportDate: data?.reportDate ? new Date(data.reportDate) : new Date(),
    dateHappened: data?.dateHappened ? new Date(data.dateHappened) : new Date(),
    tasksCompleted: data?.tasksCompleted || "",
    challengesFaced: data?.challengesFaced || "",
    nextSteps: data?.nextSteps || "",
    additionalComments: data?.additionalComments || "",
    plane: data?.plane || "",
    fileUpload: data?.fileUpload || null,
  };
};

export function EmployeeReportModal({
  open,
  setOpen,
  record,
  onComplete,
}: any) {
  const [step, setStep] = useState(1); // Step 1 or Step 2
  const { user } = useAuth();
  const values = useMemo(() => getDefaultValues(record, user), [record, user]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset(values);
  }, [record, user]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
      reportDate: values.reportDate? new Date(values.reportDate).toISOString() : null,
      dateHappened: values.dateHappened? new Date(values.dateHappened).toISOString() : null,
      employee: user.id, // Associate the report with the logged-in employee
      department: user.department, // Auto-populate with logged-in user's department
    };

    const q = !record
      ? pocketbase
          .collection("employeeReports")
          .create({ ...data, created_by: user.id })
      : pocketbase.collection("employeeReports").update(record.id, data);

    return q
      .then(async (e) => {
        onComplete();
        toast.success(
          record ? "Report updated successfully" : "Report submitted successfully"
        );
        form.reset();
        setOpen(false); // Close the modal after submission
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }
  function employeeReportLoader({ search }: { search: string }) {
    return pocketbase
      .collection("action_plans")
      .getFullList({
        filter: `plan_title~"${search}"`,
      })
      .then((e) => e.map((e) => ({ label: e.Title || e.plan_title, value: e.id })));
  }

  const handleNext = async () => {
    // Validate fields for Step 1 before proceeding
    const isValid = await form.trigger(["reportType", "reportDate", "dateHappened", "tasksCompleted"]);
    if (isValid) {
      setStep(2); // Move to Step 2
    } else {
      toast.error("Please fill out all required fields before proceeding.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : "Submit"} Employee Report
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "update" : "submit"} your report.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-4">
              {step === 1 && (
                <>
                  {/* Step 1: Basic Information */}
                  <div className="grid gap-2 grid-cols-1">
                    <AppFormSelect
                      form={form}
                      label={"Report Type"}
                      placeholder={"Select report type"}
                      name={"reportType"}
                      options={[
                        { label: "Daily Report", value: "daily" },
                        { label: "Weekly Report", value: "weekly" },
                        { label: "Monthly Report", value: "monthly" },
                      ]}
                    />

                    <AppFormAsyncSelect
                                form={form}
                                name="plane"
                                label="Select Plan"
                                placeholder="Choose employee"
                                loader={employeeReportLoader}
                              />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFormDatePicker
                      form={form}
                      label={"Report Date"}
                      name={"reportDate"}
                      placeholder={"Select date of report"}
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFormDatePicker
                      form={form}
                      label={"Date Happened"}
                      name={"dateHappened"}
                      placeholder={"Select date happened"}
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFormField
                      form={form}
                      label={"Employee Name"}
                      placeholder={"Employee name"}
                      name={"employeeName"}
                      value={user.names} // Auto-populate with logged-in user's name
                      disabled // Disable editing
                    />

                    <AppFormField
                      form={form}
                      label={"Department"}
                      placeholder={"Employee department"}
                      name={"department"}
                      value={user.department} // Auto-populate with logged-in user's department
                      disabled // Disable editing
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFormTextArea
                      form={form}
                      label={"Tasks Completed"}
                      placeholder={"List the tasks you completed"}
                      name={"tasksCompleted"}
                    />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  {/* Step 2: Additional Details */}
                  <div className="grid gap-2 grid-cols-1">
                    <AppFormTextArea
                      form={form}
                      label={"Challenges Faced"}
                      placeholder={"Describe any challenges you faced"}
                      name={"challengesFaced"}
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFormTextArea
                      form={form}
                      label={"Next Steps"}
                      placeholder={"Outline your next steps"}
                      name={"nextSteps"}
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFormTextArea
                      form={form}
                      label={"Additional Comments"}
                      placeholder={"Add any additional comments"}
                      name={"additionalComments"}
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-1">
                    <AppFileUpload
                      form={form}
                      label={"Drag & Drop attachment file here"}
                      name={"fileUpload"} // Corrected name to match formSchema
                      preview={record ? pocketbase.files.getUrl(record, record?.fileUpload) : null}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                {step === 1 && (
                  <>
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
                      type="button"
                      onClick={handleNext}
                      className="w-full"
                      size="sm"
                    >
                      Next
                    </Button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-full text-slate-600"
                      size="sm"
                      variant="outline"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        form.formState.disabled || form.formState.isSubmitting
                      }
                      className="w-full"
                      size="sm"
                    >
                      {form.formState.isSubmitting && (
                        <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                      )}
                      {record ? "Update Report" : "Submit Report"}
                    </Button>
                  </>
                )}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}