import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <>
      {/* auth */}
      <Outlet />
    </>
  );
}
