import { Fragment } from "react";
import { Transition } from "@headlessui/react";
import { useRef } from "react";
import { User, LogOut } from "react-feather";

import { useAuth } from "@/context/auth.context";
import { useNavigate } from "react-router-dom";
import Avatar from "./shared/Avatar";
import { useClickAway } from "react-use";

function ProfileDropdown({ open = false, onLogout, close }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
  };

  const actions = [
    {
      title: "My Account",
      icon: User,
      onclick: () => {
        navigate("/dashboard/settings/account-settings");
      },
    },
    // {
    //   title: "Help & Support",
    //   icon: HelpCircle,
    //   onclick: () => {},
    // },
    {
      title: "Logout",
      icon: LogOut,
      onclick: handleLogout,
    },
  ];

  const { user }: any = useAuth();

  const ref = useRef(null);
  useClickAway(ref, () => close());

  return (
    <Transition
      show={open}
      as={Fragment}
      enter="transition ease-out duration-100"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
    >
      <div
        ref={ref}
        className="absolute rounded-[3px] z-50 p-0 left-1 bottom-[70px] border y border-slate-200 drop-shadow-lg bg-white w-[97%] mx-auto"
      >
        <div className="px-2 border-b border-slate-200 py-2">
          <div className="flex items-center gap-2">
            <Avatar path={user?.photo} name={user?.names || ""} />
            <div className="space-y-1">
              <h4 className="text-[13px] font-semibold capitalize text-slate-700">
                {user.names}
              </h4>
              <p className="text-[11.5px]  text-slate-500 capitalize font-medium">
                {user?.role?.name}
              </p>
            </div>
          </div>
        </div>
        <ul className="px-2 shadow-lg- py-1">
          {actions.map((item, i) => {
            return (
              <li key={i} className="w-full my-[2px]">
                <a
                  onClick={() => {
                    item.onclick();
                    close();
                  }}
                  className="flex cursor-pointer border border-transparent hover:border-slate-200  justify-between w-full  hover:bg-slate-100 rounded-[3px] my-1 items-center gap-2 py-2 px-2"
                >
                  <div className="flex items-center flex-1 w-full gap-2">
                    <item.icon size={16} className="text-slate-600" />
                    <span className="text-[13px]  text-slate-600 font-medium capitalize">
                      {item.title}
                    </span>
                  </div>
                  <div />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </Transition>
  );
}

export default ProfileDropdown;
