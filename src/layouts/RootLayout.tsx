import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/auth.context";
import { useLocation } from "react-router-dom";
import { useRoles } from "@/context/roles.context";

export default function RootLayout() {
  const { user, loading } = useAuth();
  const { isLoading, roles, permitions = [] } = useRoles();

  const location = useLocation();

  if (loading || isLoading || !roles) {
    return (
      <div className=" w-screen h-dvh bg-white flex items-center justify-center flex-col gap-8">
        <img className="h-10 mb-2" src="/dnr_log.png" alt="" />
        <div className="w-[150px]">
          <div className="w-full m-auto">
            <div className="progress-bar h-1 rounded-md bg-primary bg-opacity-25 w-full overflow-hidden">
              <div className="progress-bar-value w-full h-full bg-primary " />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (user && !loading) {
    if (location.pathname === "/") {
      if (permitions[0].name === "view_dashboard")
        return <Navigate to="/dashboard" />;
      return <Navigate to={"/dashboard/employee-portal"} />;
    }
    return <Outlet />;
  }

  if (!user && !loading) {
    if (location.pathname === "/" || location.pathname === "/forgot-password")
      return <Outlet />;
    return <Navigate to={`/?redirect=${location.pathname}`} />;
  }
}
