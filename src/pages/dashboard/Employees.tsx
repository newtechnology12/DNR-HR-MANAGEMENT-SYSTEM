import EmployeesTable from "@/components/Employees";
import BreadCrumb from "@/components/breadcrumb";

export default function EmployeesPage() {
  return (
    <>
      <div className="px-4">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">Employees</h2>
            <BreadCrumb
              items={[{ title: "All Employees", link: "/dashboard" }]}
            />
          </div>
        </div>
        <EmployeesTable />
      </div>
    </>
  );
}
