import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { read, utils, writeFile } from "xlsx";
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
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import AppFormSelect from "../forms/AppFormSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import AppFormDatePicker from "../forms/AppFormDatepicker";

const formSchema = z.object({
  first_name: z.string().min(1, { message: "First name is a required field" }),
  last_name: z.string().min(1, { message: "Last name is a required field" }),
  email: z.string().min(1, { message: "Email is a required field" }).email(),
  phone: z.string().min(10, { message: "Phone is a required field" }),
  role: z.string().min(1, { message: "Role is a required field" }),
  department: z.string().min(1, { message: "Department is a required field" }),
  designation: z
    .string()
    .min(1, { message: "Designation is a required field" }),
  branch: z.string().min(1, { message: "Branch is a required field" }),
  employment_type: z
    .string()
    .min(1, { message: "Employment type is a required field" }),
  gender: z.string().min(1, { message: "Gender is a required field" }),
  birth: z.date(),
  country: z.string(),
  national_id: z.string(),
  salary: z.string().min(1, { message: "Salary is a required field" }),
  status: z.string().min(1, { message: "Status is a required field" }),
  bank_name: z.string(),
  bank_account_number: z.string(),
  joined_at: z.date(),
});

const getDefaultValues = (data?: any) => ({
  first_name: data?.first_name || "",
  last_name: data?.last_name || "",
  email: data?.email || "",
  phone: data?.phone || "",
  role: data?.role || "",
  department: data?.department || "",
  designation: data?.designation || "",
  branch: data?.branch || "",
  employment_type: data?.employment_type || "",
  gender: data?.gender || "",
  birth: data?.birth ? new Date(data?.birth) : undefined,
  country: data?.country || "",
  national_id: data?.national_id?.toString() || "",
  salary: data?.salary?.toString() || "",
  status: data?.status || "",
  bank_name: data?.bank_name || "",
  bank_account_number: data?.bank_account_number || "",
  joined_at: data?.joined_at ? new Date(data?.joined_at) : undefined,
});

export function EmployeFormModal({ open, setOpen, employee, onComplete }: any) {
  const values = useMemo(() => getDefaultValues(employee), [employee]);
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [employee, values, form]);

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
        toast.error(
          "Failed to import employees. Please check the file format."
        );
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "1234567890",
        role: "Developer",
        department: "Engineering",
        designation: "Software Engineer",
        branch: "New York",
        employment_type: "Permanent",
        gender: "Male",
        birth: "1990-01-01",
        country: "USA",
        national_id: "123456789",
        salary: "60000",
        status: "Active",
        bank_name: "Bank of America",
        bank_account_number: "1234567890",
        joined_at: "2020-01-01",
      },
    ];

    const worksheet = utils.json_to_sheet(sampleData);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Employees");
    writeFile(workbook, "Employee_Template.xlsx");
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      name: values.first_name.trim() + " " + values.last_name.trim(),
      joined_at: values.joined_at || new Date(),
      ...values,
    };

    console.log("Submitting data:", data); // Log the data being sent

    const q = !employee
      ? pocketbase.collection("users").create({
          emailVisibility: true,
          password: "123456",
          passwordConfirm: "123456",
          ...data,
        })
      : pocketbase.collection("users").update(employee.id, {
          status: "active",
          ...data,
        });

    return q
      .then(async () => {
        onComplete();
        toast.success(
          employee
            ? "Employee updated successfully"
            : "Employee created successfully"
        );
        form.reset();

        if (employee && employee.department !== data.department) {
          const newDepartment = await pocketbase
            .collection("departments")
            .getOne(data.department);

          const oldDepartment = await pocketbase
            .collection("departments")
            .getOne(employee?.department);

          await pocketbase.collection("departments").update(data.department, {
            employees: [...newDepartment.employees, employee.id],
          });

          await pocketbase
            .collection("departments")
            .update(employee.department, {
              employees: oldDepartment.employees.filter(
                (e) => e !== employee.id
              ),
            });
        }
      })
      .catch((e) => {
        console.error("Error response:", e); // Log the error response
        if (e.data?.email?.message) {
          form.setError("email", {
            type: "custom",
            message: e.data.email.message,
          });
        } else {
          toast.error("Something went wrong while processing your request.");
        }
      });
  }

  function rolesLoader({ search }) {
    return pocketbase
      .collection("roles")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) =>
        e.items.map((e) => ({ label: e.names || e.name, value: e.id }))
      );
  }

  function departmentsLoader({ search }) {
    return pocketbase
      .collection("departments")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) =>
        e.items.map((e) => ({ label: e.names || e.name, value: e.id }))
      );
  }

  function designationLoader({ search }) {
    return pocketbase
      .collection("designations")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) => e.items.map((e) => ({ label: e.name, value: e.id })));
  }

  function branchesLoader({ search }) {
    return pocketbase
      .collection("branches")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) =>
        e.items.map((e) => ({ label: e.names || e.name, value: e.id }))
      );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[750px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {employee ? "Edit Employee" : "Create a new employee"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {employee ? "edit" : "create"} an employee.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="personal">Personal information</TabsTrigger>
                <TabsTrigger value="work">Work information</TabsTrigger>
              </TabsList>
              <TabsContent value="personal">
                <div className="grid px-2 gap-2">
                  <div className="grid gap-2 grid-cols-2">
                    <AppFormField
                      form={form}
                      label={"First Name"}
                      placeholder={"Enter first name"}
                      name={"first_name"}
                    />
                    <AppFormField
                      form={form}
                      label={"Last Name"}
                      placeholder={"Enter last name"}
                      name={"last_name"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Email"}
                      placeholder={"Enter email"}
                      name={"email"}
                    />
                    <AppFormSelect
                      form={form}
                      label={"Gender"}
                      placeholder={"Choose gender"}
                      name={"gender"}
                      options={[
                        { label: "Male", value: "male" },
                        { label: "Female", value: "female" },
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormDatePicker
                      form={form}
                      label={"Birth Date"}
                      placeholder={"Choose birth date"}
                      name={"birth"}
                    />
                    <AppFormAsyncSelect
                      form={form}
                      label={"Country"}
                      placeholder={"Choose country"}
                      name={"country"}
                      loader={({ search }) => {
                        const countries = fetch("/countries.json")
                          .then((e) => e.json())
                          .then((e) =>
                            e.filter((e) =>
                              e.name.toLowerCase().includes(search)
                            )
                          )
                          .then((e) =>
                            e.map((e) => ({ label: e.name, value: e.name }))
                          );
                        return countries;
                      }}
                    />
                  </div>

                  <div className="grid gap-2 grid-cols-2">
                    <AppFormField
                      form={form}
                      label={"Phone Number"}
                      placeholder={"Enter phone number"}
                      name={"phone"}
                    />
                    <AppFormField
                      form={form}
                      label={"National ID"}
                      placeholder={"Enter national ID"}
                      name={"national_id"}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="work">
                <div className="px-2">
                  <div className="mb-2 grid grid-cols-2 gap-3">
                    <AppFormAsyncSelect
                      form={form}
                      label={"Role"}
                      placeholder={"Choose role"}
                      name={"role"}
                      loader={rolesLoader}
                    />
                    <AppFormAsyncSelect
                      form={form}
                      label={"Designation"}
                      placeholder={"Choose designation"}
                      name={"designation"}
                      loader={designationLoader}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormAsyncSelect
                      form={form}
                      label={"Department"}
                      placeholder={"Choose department"}
                      name={"department"}
                      loader={departmentsLoader}
                    />
                    <AppFormAsyncSelect
                      form={form}
                      label={"Branch"}
                      placeholder={"Choose branch"}
                      name={"branch"}
                      loader={branchesLoader}
                    />
                  </div>
                  <div className="mb-1 grid grid-cols-1 gap-2">
                    <AppFormField
                      form={form}
                      type={"number"}
                      label={"Salary"}
                      placeholder={"Enter salary"}
                      name={"salary"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <AppFormSelect
                      form={form}
                      label={"Employment Type"}
                      placeholder={"Choose employment type"}
                      name={"employment_type"}
                      options={[
                        { label: "Intern", value: "intern" },
                        { label: "Probation", value: "probation" },
                        { label: "Permanent", value: "permanent" },
                        { label: "Casual", value: "casual" },
                        { label: "Contract", value: "contract" },
                        { label: "Part-time", value: "part-time" },
                      ]}
                    />
                    <AppFormSelect
                      form={form}
                      label={"Employee Status"}
                      placeholder={"Choose employee status"}
                      name={"status"}
                      options={[
                        { label: "Active", value: "Active" },
                        { label: "Inactive", value: "Inactive" },
                        { label: "Suspended", value: "suspended" },
                        { label: "Terminated", value: "terminated" },
                        { label: "Resigned", value: "resigned" },
                      ]}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <AppFormField
                      form={form}
                      label={"Bank Name"}
                      placeholder={"Enter bank name"}
                      name={"bank_name"}
                    />
                    <AppFormField
                      form={form}
                      label={"Bank Account Number"}
                      placeholder={"Enter bank account number"}
                      name={"bank_account_number"}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3">
                    <AppFormDatePicker
                      form={form}
                      label={"Joined Date"}
                      placeholder={"Choose joined date"}
                      name={"joined_at"}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  onClick={() => form.reset()}
                  className="w-full text-slate-600"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reset Form
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
                  {employee ? "Update employee" : "Create new employee"}
                </Button>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                {/* <label htmlFor="file-upload" className="w-full">
                  <Button
                    type="button"
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    Import from Excel
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
                </Button> */}
                {/* <Button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="w-full"
                  size="sm"
                  variant="outline"
                >
                  Download Template
                </Button> */}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
