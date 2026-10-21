import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/auth.context";
import { useLocation } from "react-router-dom";
import { useRoles } from "@/context/roles.context";
import BrandMark from "@/components/enterprise/BrandMark";

export default function RootLayout() {
  const { user, loading } = useAuth();
  const { isLoading, permitions = [] } = useRoles();

  const location = useLocation();

  if (loading || (user && isLoading)) {
    return (
      <div className=" w-screen h-dvh bg-white flex items-center justify-center flex-col gap-8">
        <BrandMark />
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
      if (permitions?.some((permission) => permission?.name === "view_dashboard"))
        return <Navigate to="/dashboard" />;
      return <Navigate to={"/dashboard/my"} />;
    }
    return <Outlet />;
  }

  if (!user && !loading) {
    if (location.pathname === "/" || location.pathname === "/forgot-password")
      return <Outlet />;
    return <Navigate to={`/?redirect=${location.pathname}`} />;
  }

  return null;
}
