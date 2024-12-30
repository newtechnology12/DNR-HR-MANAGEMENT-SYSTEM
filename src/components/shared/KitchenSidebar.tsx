import Logo from "./Logo";
import { Link, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";
import Avatar from "./Avatar";
import { useAuth } from "@/context/auth.context";
import { useMediaQuery } from "react-responsive";

export default function KitchenSidebar({ root, links, className }) {
  const { user }: any = useAuth();

  const location = useLocation();

  const isMobile = useMediaQuery({ query: "(max-width: 650px)" });

  return (
    <div
      className={cn(
        "flex h-dvh fixed z-40 bg-slate-800 items-center flex-col justify-between gap-10 border-r border-r-gray-700",
        className
      )}
    >
      <div className="flex gap-2 sm:4 flex-col py-2 items-center">
        <div className="flex sm:px-1 px-[4px] flex-col gap-4">
          {links.map((val, indx) => {
            const isActive =
              location.pathname
                .split("/")
                .slice(0, root.split("/").length === 1 ? 3 : 4)
                .join("/") ===
              val.path
                .split("/")
                .slice(0, root.split("/").length === 1 ? 3 : 4)
                .join("/");

            return (
              <NavLink
                key={indx}
                to={val.path}
                end
                className={cn(
                  "flex flex-col items-center gap-[2px] sm:gap-[3px] py-[5px] sm:py-[7px] rounded-sm px-[5px] sm:px-[8px]",
                  {
                    "text-white bg-primary ": isActive,
                    "text-slate-300 hover:bg-slate-700": !isActive,
                  }
                )}
              >
                <span className="text-lg sm:text-base">{val.icon}</span>
                <span className="sm:text-[12px] text-[11px] font-medium">
                  {val.name}
                </span>
              </NavLink>
            );
          })}
        </div>
      </div>
      <div className="rounded-full my-4 sm:my-2 -ml-[5px] p-[2px] border-primary border-2 ">
        <Avatar name={user?.names || ""} path={user?.photo} />
      </div>
    </div>
  );
}
