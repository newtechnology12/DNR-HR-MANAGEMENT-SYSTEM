import { Camera } from "react-feather";
import { useState, useRef } from "react";
import pocketbase from "@/lib/pocketbase";
import Loader from "@/components/icons/Loader";
import Avatar from "@/components/shared/Avatar";
import BreadCrumb from "@/components/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmployeeAttendances from "./EmployeeAttendances";
import EmployeeLeaves from "./EmployeeLeaves";
import EmployeePayslips from "./EmployeePayslips";
import EmployeeAssets from "./EmployeeAssets";
import EmployeeDocuments from "./EmployeeDocuments";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { EmployeFormModal } from "@/components/modals/EmployeeFormModal";
import { cn } from "@/utils/cn";
import { useQuery } from "react-query";
import LeavesTakenVsRemaining from "@/components/LeavesTakenVsRemaining";
import EmployeePrePayments from "./EmployeePrePayments";

export default function EmployeeProfile() {
  const [activeTab, setactiveTab] = useState("Attendance Log");

  const employeeId = useParams().employeeId;

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

  return (
    <>
      <div className="px-3">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Employee Profile
            </h2>
            <BreadCrumb
              items={[{ title: "Employee Profile", link: "/dashboard" }]}
            />
          </div>
        </div>

        <div className="grid mt-2- grid-cols-8 gap-2">
          <div className="col-span-6">
            <Card className="h-full !shadow-none">
              <CardHeader className="pt-2">
                <CardTitle className="text-[15px] flex items-center justify-between">
                  <span>Profile Information</span>
                  <Button
                    onClick={() => {
                      setshowUpdateModal(true);
                    }}
                    variant="secondary"
                    className="text-primary"
                    size="sm"
                  >
                    <Edit size={14} className="mr-2" />
                    <span>Update Employee</span>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-full">
                {employee && (
                  <ProfileInformation refetch={refetch} employee={employee} />
                )}
                {isLoading && (
                  <div className="w-full min-h-[250px] flex items-center justify-center">
                    {isLoading && (
                      <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="col-span-2">
            <Card className="h-full !shadow-none flex flex-col">
              <CardTitle className="text-[15px] px-4 py-3 flex items-center justify-between">
                <span>Leaves taken vs remaining</span>
              </CardTitle>
              <LeavesTakenVsRemaining employee={employee} />
            </Card>
          </div>
        </div>

        <div className="mt-3">
          <Card>
            <div className="flex px-2 gap-4 w-full border-b items-center justify-start">
              {[
                "Attendance Log",
                "Documents",
                "Leaves",
                "Payslips",
                "Expenses",
              ].map((e, i) => {
                return (
                  <a
                    key={i}
                    className={cn(
                      "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
                      {
                        "text-primary ": activeTab === e,
                      }
                    )}
                    onClick={() => {
                      setactiveTab(e);
                    }}
                  >
                    {activeTab === e && (
                      <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                    )}
                    <span className=""> {e}</span>
                  </a>
                );
              })}
            </div>
            <div>
              {isLoading && (
                <div className="w-full min-h-[250px] flex items-center justify-center">
                  {isLoading && (
                    <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
                  )}
                </div>
              )}
              {employee && (
                <>
                  {activeTab === "Attendance Log" && (
                    <EmployeeAttendances employeeId={employee?.id} />
                  )}
                  {activeTab === "Leaves" && (
                    <EmployeeLeaves employeeId={employee?.id} />
                  )}
                  {activeTab === "Payslips" && (
                    <EmployeePayslips employeeId={employee?.id} />
                  )}
                  {activeTab === "Documents" && (
                    <EmployeeDocuments employeeId={employee?.id} />
                  )}
                  {activeTab === "Expenses" && (
                    <EmployeePrePayments employeeId={employee.id} />
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
      <EmployeFormModal
        onComplete={() => {
          refetch();
        }}
        employee={employee}
        setOpen={setshowUpdateModal}
        open={showUpdateModal}
      />
    </>
  );
}

function ProfileInformation({ employee, refetch }) {
  const [uploading, setuploading] = useState(false);

  const uploadRef = useRef<any>();

  const updateProfile = async (e: any) => {
    const file = e.target.files[0];
    setuploading(true);
    try {
      await pocketbase.collection("users").update(employee.id, {
        avatar: file,
      });
      setuploading(false);
      refetch();
    } catch (error) {
      setuploading(false);
      toast.error(error.message);
    }
  };

  return (
    <div className="h-full">
      <div className="flex mt-1 gap-3 mb-1 items-center">
        <div className="relative group overflow-hidden rounded-full">
          <input
            disabled={uploading}
            type="file"
            className="hidden"
            ref={uploadRef}
            onChange={updateProfile}
          />
          <div
            className={cn(
              "absolute z-30 group-hover:opacity-100 transition-all overflow-hidden flex items-center justify-center h-full w-full bg-black bg-opacity-30",
              {
                "opacity-0": !uploading,
                "opacity-100": uploading,
              }
            )}
          >
            <a
              onClick={() => {
                uploadRef.current.click();
              }}
              className="h-7 w-7 cursor-pointer flex items-center justify-center bg-white rounded-full"
            >
              {uploading ? (
                <Loader className="mr-2- h-4 w-4 text-primary animate-spin" />
              ) : (
                <Camera size={14} className="text-slate-600" />
              )}
            </a>
          </div>
          <Avatar
            className="!h-10 !w-10 border"
            path={pocketbase.files.getUrl(employee, employee?.avatar)}
            name={employee?.name || "G"}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-[12.5px] capitalize font-semibold text-slate-700">
              {employee?.name}
            </h4>
          </div>
          <p className="text-[12.5px] capitalize mt-1 font-medium text-slate-500">
            {employee?.expand?.role?.name}
          </p>
        </div>
      </div>
      <div className="grid px-[6px] gap-6 my-2 pt-3 grid-cols-3">
        {[
          { key: "First name", value: employee?.name?.split(" ")[0] },
          { key: "Last name", value: employee?.name?.split(" ")[1] },
          { key: "Email", value: employee.email || "N.A" },
          { key: "Gender", value: employee.gender || "N.A" },
          {
            key: "Birth",
            value: new Date(employee.birth).toLocaleDateString("en-US", {
              month: "long",
              day: "2-digit",
              year: "numeric",
            }),
          },
          { key: "National Id", value: employee.national_id || "N.A" },
          { key: "Phone", value: employee.phone || "N.A" },
          { key: "Country", value: employee?.country || "N.A" },
          {
            key: "Address",
            value: employee?.address || "N.A",
          },
          {
            key: "Salary",
            value: Number(employee?.salary).toLocaleString("en-US", {
              style: "currency",
              currency: "RWF",
            }),
          },
          {
            key: "Department",
            value: employee?.expand?.department?.name || "N.A",
          },
          {
            key: "Designation",
            value: employee?.expand?.designation?.name || "N.A",
          },
          {
            key: "Employment type",
            value: employee?.employment_type || "N.A",
          },
          {
            key: "Branch",
            value: employee?.expand?.branch?.name || "N.A",
          },
          {
            key: "Bank name",
            value: employee?.bank_name || "N.A",
          },
          {
            key: "Bank account number",
            value: employee?.bank_account_number || "N.A",
          },
          {
            key: "Role",
            value: employee?.expand?.role?.name || "N.A",
          },
          {
            key: "Joined at",
            value:
              new Date(employee?.joined_at).toLocaleDateString("en-US", {
                month: "long",
                day: "2-digit",
                year: "numeric",
              }) || "N.A",
          },
        ].map((e, i) => {
          return (
            <div className="flex  items-center gap-4" key={i}>
              <span className="text-[12.5px] font-medium- capitalize text-slate-500">
                {e.key}:
              </span>
              <span className="text-[12.5px] truncate font-semibold capitalize text-slate-700">
                {e.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
