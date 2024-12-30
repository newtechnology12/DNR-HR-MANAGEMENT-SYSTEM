import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export default function useShowSidebar() {
  const { search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const param = searchParams.get("show_sidebar");

  const showSideBar = useMemo(() => {
    return param === "yes" ? true : false;
  }, [param]);

  return { showSideBar };
}
