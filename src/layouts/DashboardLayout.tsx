import DashboardSidebar from "@/components/DashboardSidebar";
import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <>
      <DashboardSidebar />
      <div className="pl-[280px] ">
        <div className="max-w-7xl mx-auto py-3">
          <Outlet />
        </div>
      </div>
    </>
  );
}
