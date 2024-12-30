import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { read, utils, writeFile } from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import Loader from "../icons/Loader";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import AppFormSelect from "../forms/AppFormSelect";
import AppFormDatePicker from "../forms/AppFormDatepicker";
import { useAuth } from "@/context/auth.context";
import AppFormTextArea from "../forms/AppFormTextArea";
import AppFileUpload from "../forms/AppFileUpload";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import calculateRemainingLeaves from "@/utils/calculateRemainingLeaves";
import useSettings from "@/hooks/useSettings";

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const formSchema = z.object({
  employee: z.string().min(1, { message: "Please choose an employee" }),
  type: z.string().min(1, { message: "Please choose a leave type" }),
  status: z.string().min(1, { message: "Please choose a leave status" }),
  start: z.date({ required_error: "Please choose a start date" }),
  end: z.date({ required_error: "Please choose a start date" }),
  Leaveduration: z.number(),
  reason: z.string().min(1, { message: "Please enter a reason for leave" }),
  attachment: z.any(),
});

const getDefaultValues = (data?: any) => {
  console.log(data);
  return {
    employee: data?.employee || "",
    type: data?.type || "",
    status: data?.status || "",
    start: data?.start ? new Date(data?.start) : undefined,
    end: data?.end ? new Date(data?.end) : undefined,
    Leaveduration: data?.Leaveduration || 0,
    reason: data?.reason || "",
    attachment: data?.attachment || undefined,
  };
};

export function LeaveFormModal({
  open,
  setOpen,
  record,
  onComplete,
  employeeId,
}: any) {
  console.log(record);
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const values = useMemo(
    () =>
      getDefaultValues({ ...record, employee: employeeId || record?.employee }),
    [record, employeeId]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [record, values]);

  const { user } = useAuth();

  const [error, setError] = useState("");

  const { settings } = useSettings();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setError(undefined);
    const data = {
      ...values,
      start: new Date(values.start).toISOString(),
      end: new Date(values.end).toISOString(),
    };

    const days = calculateLeaveDuration(data.start, data.end);

    // // check if are not in the past
    // if (new Date(data.start).getTime() < new Date().getTime()) {
    //   return setError("Start date must be greater than today");
    // }

    console.log(days);
    // check if days is greater than 0
    if (days <= 0) {
      return setError("End date must be greater than start date");
    }

    if (data.type === "annual") {
      const employee_data = await pocketbase
        .collection("users")
        .getOne(data.employee);
      const { remaining } = await calculateRemainingLeaves({
        employee: employee_data,
        leaves_per_year: settings?.leaves_per_year,
      });

      // check if days is greater than remaining leaves
      if (remaining < days) {
        return setError("You do not have enough annual leaves remaining");
      }
    }
    const q = !record
      ? pocketbase
          .collection("leaves")
          .create({ ...data, created_by: user.id, days, status: "pending" })
      : pocketbase.collection("leaves").update(record.id, data);

    return q
      .then(async (e) => {
        onComplete();
        toast.success(
          record ? "Leave updated successfully" : "Leave created successfully"
        );
        form.reset();
        setError(undefined);
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  function employeesLoader({ search }) {
    return pocketbase
      .collection("users")
      .getFullList({
        filter: `name~"${search}"`,
      })
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  function calculateLeaveDuration(start, end) {
    return Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) /
        (1000 * 3600 * 24)
    );
  }

  function exportExcelTemplate() {
    const ws = utils.json_to_sheet([
      {
        employee: "",
        type: "",
        status: "",
        start: "",
        end: "",
        Leaveduration: "",
        reason: "",
        attachment: "",
      },
    ]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Template");
    writeFile(wb, "LeaveTemplate.xlsx");
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = utils.sheet_to_json(worksheet);

        for (const row of jsonData) {
          const values = getDefaultValues(row);
          await onSubmit(values);
        }

        toast.success("Employees imported successfully");
        setFile(null);
      } catch (error) {
        console.error("Error importing file:", error);
        toast.error("Failed to import employees. Please check the file format.");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update leave" : "Create a new leave"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "update" : "create"} a leave.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {error && (
              <div className="mb-3 px-2">
                <Alert
                  variant="destructive"
                  className="py-2 mt-3- rounded-[4px] flex items-center"
                >
                  <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                  <AlertTitle className="text-[13px] font-medium fon !m-0">
                    {error}
                  </AlertTitle>
                </Alert>
              </div>
            )}
            <div className="grid px-2 gap-2">
              <div className="grid gap-2 grid-cols-2">
                <AppFormAsyncSelect
                  form={form}
                  label={"Choose employee"}
                  placeholder={"Choose employee"}
                  name={"employee"}
                  loader={employeesLoader}
                  isDisabled={!!employeeId}
                />
                <AppFormSelect
                  form={form}
                  label={"Choose type"}
                  placeholder={"Enter leave type"}
                  name={"type"}
                  options={[
                    "annual",
                    "maternity",
                    "paternity",
                    "sick",
                    "study",
                    "unpaid",
                    "other",
                  ].map((e) => ({ label: capitalizeFirstLetter(e), value: e }))}
                />
              </div>

              <div className="grid gap-2 grid-cols-2">
                <AppFormDatePicker
                  form={form}
                  label={"Choose start date"}
                  placeholder={"Choose start date"}
                  name={"start"}
                />
                <AppFormDatePicker
                  form={form}
                  label={"Choose end date"}
                  placeholder={"Choose end date"}
                  name={"end"}
                />
              </div>
              <div className="mb-2">
                <AppFormTextArea
                  form={form}
                  label={"Reason"}
                  placeholder={"Enter reason for leave"}
                  name={"reason"}
                />
              </div>
              <AppFileUpload
                form={form}
                label={"Drag & Drop attachment file here"}
                name={"attachment"}
                preview={pocketbase.files.getUrl(record, record?.attachment)}
              />
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
                  {record ? "Update leave" : "Create new leave"}
                </Button>
                <Button
                  type="button"
                  onClick={exportExcelTemplate}
                  className="w-full text-slate-600"
                  size="sm"
                  variant="outline"
                >
                  Export Excel Template
                </Button>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="import-excel"
                />
                <label htmlFor="import-excel" className="w-full">
                  <Button
                    type="button"
                    className="w-full text-slate-600"
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('import-excel')?.click()}
                  >
                    Import Excel Template
                  </Button>
                </label>
                <Button
                  type="button"
                  onClick={handleImport}
                  className="w-full"
                  size="sm"
                  variant="outline"
                  disabled={!file || isImporting}
                >
                  {isImporting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  Process Import
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}