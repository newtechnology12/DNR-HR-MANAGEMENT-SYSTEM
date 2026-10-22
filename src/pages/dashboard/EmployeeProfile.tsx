import { useRef, useState } from "react";
import { useQuery } from "react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Pencil, UserX } from "lucide-react";
import { differenceInMonths } from "date-fns";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import useSettings from "@/hooks/useSettings";
import calculateRemainingLeaves from "@/utils/calculateRemainingLeaves";
import { EMPLOYMENT_TYPES } from "@/lib/hr";
import { EmployeePhoto } from "@/components/Employees";
import { EmployeeFormModal } from "@/components/modals/EmployeeFormModal";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DetailHeader,
  Details,
  EmptyState,
  KpiBand,
  Page,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtNumber,
  sentence,
  toDate,
} from "@/components/ims";
import EmployeeAttendances from "./EmployeeAttendances";
import EmployeeLeaves from "./EmployeeLeaves";
import EmployeePayslips from "./EmployeePayslips";
import EmployeeDocuments from "./EmployeeDocuments";
import EmployeePrePayments from "./EmployeePrePayments";

const LIST = "/dashboard/hr/employees";
/** Five tabs: payslips and expense claims share one tab. */
const TABS = ["details", "attendance", "leave", "pay", "documents"] as const;
type TabKey = (typeof TABS)[number];

const days = (n?: number | null) => (n === null || n === undefined ? "—" : `${fmtNumber(n)} ${Number(n) === 1 ? "day" : "days"}`);

/** "3 years 2 months" since the joining date. */
function serviceLength(joined?: string) {
  const d = toDate(joined);
  if (!d) return null;
  const months = Math.max(0, differenceInMonths(new Date(), d));
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!y) return part(m, "month");
  return m ? `${part(y, "year")} ${part(m, "month")}` : part(y, "year");
}

export default function EmployeeProfile() {
  const employeeId = useParams().employeeId;
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") || "details";
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : "details";
  const setTab = (t: string) => setParams(t === "details" ? {} : { tab: t });

  const getEmployeeProfile = async () => {
    const data = await pocketbase.collection("users").getOne(employeeId, {
      expand: "role,department,branch,designation",
    });
    return data;
  };

  const {
    data: employee,
    refetch,
    isLoading,
  } = useQuery(["employees", employeeId], getEmployeeProfile, {
    enabled: Boolean(employeeId),
  });

  const [showUpdateModal, setshowUpdateModal] = useState(undefined);

  // Annual leave balance: the same calculation (and cache) as the leave chart it replaces.
  const { settings, isLoading: settingsLoading } = useSettings();
  const leaves_per_year = settings?.leaves_per_year || 0;
  const leaveQuery = useQuery(
    ["my-leaves-analytics", employee?.id],
    () => calculateRemainingLeaves({ employee: employee as any, leaves_per_year }),
    {
      keepPreviousData: true,
      retry: false,
      staleTime: Infinity,
      enabled: Boolean(employee?.id) && Boolean(leaves_per_year),
    }
  );

  if (isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!employee) {
    return (
      <Page>
        <Card>
          <EmptyState icon={UserX} text="This employee is not available. The record may have been removed." action={<ButtonLink to={LIST}>Back to employees</ButtonLink>} />
        </Card>
      </Page>
    );
  }

  const e: any = employee;
  const leave = leaveQuery.data;
  const service = serviceLength(e.joined_at);

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to employees", to: LIST }}
        type="Employee"
        status={e.status}
        title={e.name}
        facts={[e.expand?.designation?.name, e.expand?.department?.name, e.expand?.branch?.name]}
        actions={
          <Button variant="primary" icon={Pencil} onClick={() => setshowUpdateModal(true)}>
            Edit employee
          </Button>
        }
      />

      <KpiBand
        loading={settingsLoading || (leaveQuery.isLoading && Boolean(leaves_per_year))}
        items={[
          { label: "Annual leave taken", value: leaves_per_year ? days(leave?.taken) : "—", sub: "This year" },
          { label: "Annual leave remaining", value: leaves_per_year ? days(leave?.remaining) : "—", sub: "Accrued to date" },
          { label: "Annual entitlement", value: leaves_per_year ? days(leaves_per_year) : "—", sub: leaves_per_year ? "Per year" : "Not set in leave settings" },
          { label: "Length of service", value: service || "—", sub: e.joined_at ? `Joined ${fmtDate(e.joined_at)}` : "No joining date" },
        ]}
      />

      <Tabs
        label="Employee sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "attendance", label: "Attendance" },
          { key: "leave", label: "Leave" },
          { key: "pay", label: "Pay and expenses" },
          { key: "documents", label: "Documents" },
        ]}
      />

      {tab === "details" && <ProfileInformation refetch={refetch} employee={e} />}

      {tab === "attendance" && (
        <Card padded={false} className="relative overflow-hidden">
          <EmployeeAttendances employeeId={e.id} />
        </Card>
      )}
      {tab === "leave" && (
        <Card padded={false} className="relative overflow-hidden">
          <EmployeeLeaves employeeId={e.id} />
        </Card>
      )}
      {tab === "pay" && (
        <>
          <Card className="relative overflow-hidden">
            <CardHeader title="Payslips" subtitle="Monthly payslips from approved payrolls." />
            <EmployeePayslips employeeId={e.id} />
          </Card>
          <Card className="relative overflow-hidden">
            <CardHeader title="Expenses" subtitle="Expense claims and advances requested by this employee." />
            <EmployeePrePayments employeeId={e.id} />
          </Card>
        </>
      )}
      {tab === "documents" && (
        <Card padded={false} className="relative overflow-hidden">
          <EmployeeDocuments employeeId={e.id} />
        </Card>
      )}

      <EmployeeFormModal
        onComplete={() => {
          refetch();
        }}
        employee={employee}
        setOpen={setshowUpdateModal}
        open={showUpdateModal}
      />
    </Page>
  );
}

/**
 * The fields shown before, grouped. Personal fields arrive empty for viewers without
 * "view_employee_profile" (the server blanks them); they then read "—".
 */
function ProfileInformation({ employee, refetch }: { employee: any; refetch: () => void }) {
  const [uploading, setuploading] = useState(false);

  const uploadRef = useRef<HTMLInputElement>(null);

  const updateProfile = async (e: any) => {
    const file = e.target.files[0];
    setuploading(true);
    try {
      await pocketbase.collection("users").update(employee.id, {
        avatar: file,
      });
      setuploading(false);
      refetch();
      toast.success(`Photo of ${employee.name} updated`);
    } catch (error) {
      setuploading(false);
      toast.error(error.message);
    }
  };

  const [first, ...rest] = String(employee?.name || "").split(" ");
  const employmentType = EMPLOYMENT_TYPES.find((t) => t.value === employee?.employment_type)?.label || sentence(employee?.employment_type);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Personal" />
          <div className="mb-5 flex items-center gap-4">
            <EmployeePhoto record={employee} name={employee?.name} className="h-16 w-16" />
            <div className="min-w-0">
              <p className="truncate text-t-body font-semibold text-ims-text">{employee?.name}</p>
              <input disabled={uploading} type="file" accept="image/*" className="hidden" ref={uploadRef} onChange={updateProfile} aria-label="Choose a photo" />
              <Button size="sm" className="mt-1.5" icon={Camera} loading={uploading} onClick={() => uploadRef.current?.click()}>
                {employee?.avatar ? "Change photo" : "Add photo"}
              </Button>
            </div>
          </div>
          <Details
            items={[
              { label: "First name", value: first },
              { label: "Last name", value: rest.join(" ") },
              { label: "Gender", value: employee?.gender },
              { label: "Date of birth", value: employee?.birth ? fmtDate(employee.birth) : null },
              { label: "National ID", value: employee?.national_id && <span className="tabular-nums">{employee.national_id}</span> },
              { label: "Country", value: employee?.country },
              { label: "Address", value: employee?.address, wide: true },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Contact" />
          <Details
            items={[
              { label: "Email", value: employee?.email && <a className="break-all text-ims-link hover:underline" href={`mailto:${employee.email}`}>{employee.email}</a> },
              { label: "Phone", value: employee?.phone && <span className="tabular-nums">{employee.phone}</span> },
            ]}
          />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Employment" />
          <Details
            items={[
              { label: "Department", value: employee?.expand?.department?.name },
              { label: "Designation", value: employee?.expand?.designation?.name },
              { label: "Employment type", value: employmentType },
              { label: "Office", value: employee?.expand?.branch?.name },
              { label: "System role", value: employee?.expand?.role?.name },
              { label: "Joined", value: employee?.joined_at ? fmtDate(employee.joined_at) : null },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Pay and bank" />
          <Details
            items={[
              { label: "Gross salary", value: employee?.salary ? fmtMoney(employee.salary) : null },
              { label: "Bank", value: employee?.bank_name },
              { label: "Bank account number", value: employee?.bank_account_number && <span className="font-mono">{employee.bank_account_number}</span> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
