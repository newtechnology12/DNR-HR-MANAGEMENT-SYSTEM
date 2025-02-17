import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
// import { read, utils, writeFile } from "xlsx";
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


const formSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  names: z.string().optional(),
  other_names: z.string().optional(),
  nationality: z.string().optional(),
  id_passport_number: z.string().optional(),
  personal_telephone: z.string().optional(),
  personal_email: z.string().optional(),
  father_name: z.string().optional(),
  mother_name: z.string().optional(),
  place_of_birth: z.string().optional(),
  full_address: z.string().optional(),
  department: z.string().optional(),
  status: z.string().min(1, { message: "Status is required" }),
  certified_academic_documents: z.string().optional(),
  previous_employers: z.string().optional(),
  number_of_dependents: z.string().optional(),
  spouse_name: z.string().optional(),
  spouse_telephone: z.string().optional(),
  spouse_email: z.string().optional(),
  spouse_occupation: z.string().optional(),
  spouse_employer: z.string().optional(),
  spouse_position: z.string().optional(),
  spouse_medical_insurance: z.string().optional(),
  spouse_id_passport: z.string().optional(),
  children_names: z.string().optional(),
  recent_tested_diseases: z.string().optional(),
  physical_handicap: z.string().optional(),
  ongoing_education: z.string().optional(),
  other_employment: z.string().optional(),
  business_shareholding: z.string().optional(),
  bank_accounts: z.string().optional(),
  loans_ongoing: z.string().optional(),
  recent_pay_slips: z.string().optional(),
  recent_bank_statements: z.string().optional(),
  criminal_record: z.string().optional(),
  role: z.string().min(1, { message: "Role is required" }),
  designation: z.string().optional(),
  branch: z.string().optional(),
  employment_type: z.string().optional(),
  gender: z.string().optional(),
  birth: z.date(),
  country: z.string().optional(),
  national_id: z.string().optional(),
  salary: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  joined_at: z.date(),
});

const getDefaultValues = (data?: any) => ({
  first_name: data?.first_name || "",
  last_name: data?.last_name || "",
  name: data?.names || "", // Map to database column `name`
  other_names: data?.other_names || "",
  nationality: data?.nationality || "",
  id_passport_number: data?.id_passport_number || "",
  personal_telephone: data?.phone || "", // Map to database column `phone`
  personal_email: data?.email || "", // Map to database column `email`
  father_name: data?.father_name || "",
  mother_name: data?.mother_name || "",
  place_of_birth: data?.place_of_birth || "",
  full_address: data?.address || "", // Map to database column `address`
  department: data?.department || "",
  status: data?.status || "",
  certified_academic_documents: data?.certified_academic_documents || "",
  previous_employers: data?.previous_employers || "",
  number_of_dependents: data?.number_of_dependents || 0,
  spouse_name: data?.spouse_name || "",
  spouse_telephone: data?.spouse_telephone || "",
  spouse_email: data?.spouse_email || "",
  spouse_occupation: data?.spouse_occupation || "",
  spouse_employer: data?.spouse_employer || "",
  spouse_position: data?.spouse_position || "",
  spouse_medical_insurance: data?.spouse_medical_insurance || "",
  spouse_id_passport: data?.spouse_id_passport || "",
  children_names: data?.children_names || "",
  recent_tested_diseases: data?.recent_tested_diseases || "",
  physical_handicap: data?.physical_handicap || "",
  ongoing_education: data?.ongoing_education || "",
  other_employment: data?.other_employment || "",
  business_shareholding: data?.business_shareholding || "",
  bank_accounts: data?.bank_accounts || "",
  loans_ongoing: data?.loans_ongoing || "",
  recent_pay_slips: data?.recent_pay_slips || "",
  recent_bank_statements: data?.recent_bank_statements || "",
  criminal_record: data?.criminal_record || "",
  role: data?.role || "",
  designation: data?.designation || "",
  branch: data?.branch || "",
  employment_type: data?.employment_type || "",
  gender: data?.gender || "",
  birth: data?.birth ? new Date(data?.birth) : undefined,
  country: data?.country || "",
  national_id: data?.national_id || "",
  salary: data?.salary || "",
  bank_name: data?.bank_name || "",
  bank_account_number: data?.bank_account_number || "",
  joined_at: data?.joined_at ? new Date(data?.joined_at) : undefined,
});

export function EmployeeFormModal({ open, setOpen, employee, onComplete }: any) {
  const values = useMemo(() => getDefaultValues(employee), [employee]);
  // const [file, setFile] = useState<File | null>(null);
  // const [isImporting, setIsImporting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [employee, values, form]);

  // const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (file) {
  //     setFile(file);
  //   }
  // };

  // const handleImport = async () => {
  //   if (!file) return;

  //   setIsImporting(true);
  //   const reader = new FileReader();
  //   reader.onload = async (event) => {
  //     try {
  //       const data = new Uint8Array(event.target?.result as ArrayBuffer);
  //       const workbook = read(data, { type: "array" });
  //       const sheetName = workbook.SheetNames[0];
  //       const worksheet = workbook.Sheets[sheetName];
  //       const jsonData = utils.sheet_to_json(worksheet);

  //       for (const row of jsonData) {
  //         const values = getDefaultValues(row);
  //         await onSubmit(values);
  //       }

  //       toast.success("Employees imported successfully");
  //       setFile(null);
  //     } catch (error) {
  //       console.error("Error importing file:", error);
  //       toast.error("Failed to import employees. Please check the file format.");
  //     } finally {
  //       setIsImporting(false);
  //     }
  //   };
  //   reader.readAsArrayBuffer(file);
  // };

  // const handleDownloadTemplate = () => {
  //   const sampleData = [
  //     {
  //       first_name: "John",
  //       last_name: "Doe",
  //       other_names: "Michael",
  //       nationality: "American",
  //       id_passport_number: "123456789",
  //       personal_telephone: "1234567890",
  //       personal_email: "john.doe@example.com",
  //       father_name: "John Doe Sr.",
  //       mother_name: "Jane Doe",
  //       place_of_birth: "New York",
  //       full_address: "123 Main St, New York, USA",
  //       department: "Engineering",
  //       status: "Active",
  //       certified_academic_documents: "Yes",
  //       previous_employers: "XYZ Corp",
  //       number_of_dependents: 2,
  //       spouse_name: "Jane Doe",
  //       spouse_telephone: "0987654321",
  //       spouse_email: "jane.doe@example.com",
  //       spouse_occupation: "Teacher",
  //       spouse_employer: "ABC School",
  //       spouse_position: "Senior Teacher",
  //       spouse_medical_insurance: "Yes",
  //       spouse_id_passport: "987654321",
  //       children_names: "Alice, Bob",
  //       recent_tested_diseases: "None",
  //       physical_handicap: "None",
  //       ongoing_education: "MBA",
  //       other_employment: "None",
  //       business_shareholding: "None",
  //       bank_accounts: "Bank of America",
  //       loans_ongoing: "None",
  //       recent_pay_slips: "Yes",
  //       recent_bank_statements: "Yes",
  //       criminal_record: "None",
  //       role: "Developer",
  //       designation: "Software Engineer",
  //       branch: "New York",
  //       employment_type: "Permanent",
  //       gender: "Male",
  //       birth: "1990-01-01",
  //       country: "USA",
  //       national_id: "123456789",
  //       salary: "60000",
  //       bank_name: "Bank of America",
  //       bank_account_number: "1234567890",
  //       joined_at: "2020-01-01",
  //     },
  //   ];

  //   const worksheet = utils.json_to_sheet(sampleData);
  //   const workbook = utils.book_new();
  //   utils.book_append_sheet(workbook, worksheet, "Employees");
  //   writeFile(workbook, "Employee_Template.xlsx");
  // };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("Form submitted with values:", values); // Debugging log
  
    // Map form values to database columns
    const data = {
      email: values.personal_email, // Map personal_email to email
      name: values.first_name.trim() + " " + values.last_name.trim(), // Concatenate first_name and last_name
      phone: values.personal_telephone, // Map personal_telephone to phone
      status: values.status,
      salary: values.salary,
      department: values.department,
      gender: values.gender,
      birth: values.birth,
      national_id: values.national_id,
      country: values.country,
      address: values.full_address, // Map full_address to address
      role: values.role,
      branch: values.branch,
      employment_type: values.employment_type,
      bank_name: values.bank_name,
      bank_account_number: values.bank_account_number,
      designation: values.designation,
      joined_at: values.joined_at || new Date(),
      other_names: values.other_names,
      father_name: values.father_name,
      mother_name: values.mother_name,
      place_of_birth: values.place_of_birth,
      certified_academic_documents: values.certified_academic_documents,
      previous_employers: values.previous_employers,
      number_of_dependents: values.number_of_dependents,
      spouse_name: values.spouse_name,
      spouse_telephone: values.spouse_telephone,
      spouse_email: values.spouse_email,
      spouse_occupation: values.spouse_occupation,
      spouse_employer: values.spouse_employer,
      spouse_position: values.spouse_position,
      spouse_medical_insurance: values.spouse_medical_insurance,
      spouse_id_passport: values.spouse_id_passport,
      children_names: values.children_names,
      recent_tested_diseases: values.recent_tested_diseases,
      physical_handicap: values.physical_handicap,
      ongoing_education: values.ongoing_education,
      other_employment: values.other_employment,
      business_shareholding: values.business_shareholding,
      loans_ongoing: values.loans_ongoing,
      recent_pay_slips: values.recent_pay_slips,
      recent_bank_statements: values.recent_bank_statements,
      criminal_record: values.criminal_record,
    };
  
    console.log("Mapped data for submission:", data); // Debugging log
  
    try {
      // Check if the user already exists
      const existingUser = await pocketbase
        .collection("users")
        .getFirstListItem(`email = "${values.personal_email}"`)
        .catch(() => null);
  
      if (existingUser && !employee) {
        // If user exists and we're not updating an existing employee
        const shouldUpdate = confirm(
          "User already exists. Do you want to update the existing record?"
        );
  
        if (shouldUpdate) {
          // Update the existing user
          await pocketbase.collection("users").update(existingUser.id, {
            ...data,
          });
  
          onComplete();
          toast.success("Employee updated successfully");
          form.reset();
          return;
        } else {
          // Do not proceed with creating a new user
          toast.info("User creation canceled.");
          return;
        }
      }
  
      // If user does not exist or we're updating an existing employee
      const q = !employee
        ? pocketbase.collection("users").create({
            emailVisibility: true,
            password: "123456", // Default password
            passwordConfirm: "123456", // Default password confirmation
            ...data,
          })
        : pocketbase.collection("users").update(employee.id, {
            ...data,
          });
  
      await q;
  
      onComplete();
      toast.success(
        employee
          ? "Employee updated successfully"
          : "Employee created successfully"
      );
      form.reset();
  
      // Handle department changes if updating an employee
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
  
        await pocketbase.collection("departments").update(employee.department, {
          employees: oldDepartment.employees.filter((e) => e !== employee.id),
        });
      }
    } catch (e) {
      console.error("Error during submission:", e); // Debugging log
      if (e.data?.email?.message) {
        form.setError("personal_email", {
          type: "custom",
          message: e.data.email.message,
        });
      } else {
        toast.error("Something went wrong while processing your request.");
      }
    }
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
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="personal">Personal Info</TabsTrigger>
                <TabsTrigger value="family">Family Info</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="banking">Banking & Legal</TabsTrigger>
              </TabsList>

              {/* Personal Information Tab */}
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
                  <div className="grid grid-cols-1 gap-2">
                    <AppFormField
                    form={form}
                    label={"names"}
                    placeholder={"Enter Full Name"}
                    name={"name"}                 
                  />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Other Names"}
                      placeholder={"Enter other names"}
                      name={"other_names"}
                    />
                    <AppFormField
                      form={form}
                      label={"Nationality"}
                      placeholder={"Enter nationality"}
                      name={"nationality"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"ID/Passport Number"}
                      placeholder={"Enter ID/Passport"}
                      name={"id_passport_number"}
                    />
                    <AppFormField
                      form={form}
                      label={"Personal Telephone"}
                      placeholder={"Enter phone number"}
                      name={"personal_telephone"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Personal Email"}
                      placeholder={"Enter email"}
                      name={"email"}
                    />
                    <AppFormField
                      form={form}
                      label={"Father's Name"}
                      placeholder={"Enter father's name"}
                      name={"father_name"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Mother's Name"}
                      placeholder={"Enter mother's name"}
                      name={"mother_name"}
                    />
                    <AppFormField
                      form={form}
                      label={"Place of Birth"}
                      placeholder={"Enter place of birth"}
                      name={"place_of_birth"}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <AppFormField
                      form={form}
                      label={"Full Address"}
                      placeholder={"Enter full address"}
                      name={"full_address"}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Family Information Tab */}
              <TabsContent value="family">
                <div className="grid px-2 gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Spouse Name"}
                      placeholder={"Enter spouse name"}
                      name={"spouse_name"}
                    />
                    <AppFormField
                      form={form}
                      label={"Spouse Telephone"}
                      placeholder={"Enter spouse phone"}
                      name={"spouse_telephone"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Spouse Email"}
                      placeholder={"Enter spouse email"}
                      name={"spouse_email"}
                    />
                    <AppFormField
                      form={form}
                      label={"Spouse Occupation"}
                      placeholder={"Enter spouse occupation"}
                      name={"spouse_occupation"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Spouse Employer"}
                      placeholder={"Enter spouse employer"}
                      name={"spouse_employer"}
                    />
                    <AppFormField
                      form={form}
                      label={"Spouse Position"}
                      placeholder={"Enter spouse position"}
                      name={"spouse_position"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Spouse Medical Insurance"}
                      placeholder={"Enter spouse medical insurance"}
                      name={"spouse_medical_insurance"}
                    />
                    <AppFormField
                      form={form}
                      label={"Spouse ID/Passport"}
                      placeholder={"Enter spouse ID/Passport"}
                      name={"spouse_id_passport"}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <AppFormField
                      form={form}
                      label={"Children Names"}
                      placeholder={"Enter children names"}
                      name={"children_names"}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Employment Information Tab */}
              <TabsContent value="employment">
                <div className="grid px-2 gap-2">
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Salary"}
                      placeholder={"Enter salary"}
                      name={"salary"}
                    />
                    <AppFormField
                      form={form}
                      label={"Certified Academic Documents"}
                      placeholder={"Enter academic documents"}
                      name={"certified_academic_documents"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Previous Employers"}
                      placeholder={"Enter previous employers"}
                      name={"previous_employers"}
                    />
                    <AppFormField
                      form={form}
                      label={"Number of Dependents"}
                      placeholder={"Enter number of dependents"}
                      name={"number_of_dependents"}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Banking & Legal Information Tab */}
              <TabsContent value="banking">
                <div className="grid px-2 gap-2">
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Loans Ongoing"}
                      placeholder={"Enter loans ongoing"}
                      name={"loans_ongoing"}
                    />
                    <AppFormField
                      form={form}
                      label={"Recent Pay Slips"}
                      placeholder={"Enter recent pay slips"}
                      name={"recent_pay_slips"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AppFormField
                      form={form}
                      label={"Recent Bank Statements"}
                      placeholder={"Enter recent bank statements"}
                      name={"recent_bank_statements"}
                    />
                    <AppFormField
                      form={form}
                      label={"Criminal Record"}
                      placeholder={"Enter criminal record"}
                      name={"criminal_record"}
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
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}