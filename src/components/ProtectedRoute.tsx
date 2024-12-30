import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth.context";
import { Button } from "./ui/button";
import { useRoles } from "@/context/roles.context";

export function ProtectedRoute({ entity, children }: any) {
  const { user } = useAuth();
  const { roles = 0 } = useRoles();

  const allowedRoles = roles?.filter((e) =>
    e?.permitions?.find((e) => e.name === entity && e.access === true)
  );

  const allowed = allowedRoles?.find((e) => e?.id === user?.role?.id);

  const location = useLocation();

  if (!user) {
    return <Navigate to={`/auth/login?redirect=${location.pathname}`} />;
  }

  const navigate = useNavigate();

  if (allowed) {
    return <>{children}</>;
  } else {
    return (
      <div>
        <div className="flex bg-white  max-w-2xl rounded-sm border border-slate-200 mx-auto my-12 items-center justify-center flex-col gap-4 py-24">
          <div className="bg-red-200 border-[6px] border-red-100 h-16 w-16 rounded-full flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-6 w-6 text-red-500"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g id="SVGRepo_bgCarrier" strokeWidth={0} />
              <g
                id="SVGRepo_tracerCarrier"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g id="SVGRepo_iconCarrier">
                {"{"}" "{"}"}
                <path
                  d="M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {"{"}" "{"}"}
              </g>
            </svg>
          </div>
          <div className="flex flex-col gap-2 text-center">
            <h4 className="font-semibold text-[15px]">Access denied</h4>
            <h4 className="font-medium text-slate-500 leading-7 text-sm">
              You do not have permission to access this page,
              <br /> contact your admin.
            </h4>
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => {
                  navigate(-1);
                }}
              >
                Go to previous page
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
