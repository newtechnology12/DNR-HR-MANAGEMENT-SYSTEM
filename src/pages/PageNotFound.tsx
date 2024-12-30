import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function PageNotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[50vh] px-4 sm:px-6 py-56 md:grid md:place-items-center lg:px-8">
      <div className="max-w-max mx-auto">
        <main className="flex md:flex-col md:justify-start">
          <p className="font-semibold md:text-center text-primary text-4xl">
            - 404
          </p>
          <div className="ml-6 md:mt-5 md:ml-0">
            <div className="border-l md:text-center md:pl-0 md:border-none border-gray-200 pl-6">
              <h1 className="font-semibold mb-4 text-gray-900 tracking-tight text-xl">
                Page not found
              </h1>
              <p className="mt-1 leading-8 text-sm text-gray-500">
                Please check the URL in the address bar <br /> and try again.
              </p>
            </div>
            <div className="mt-7 flex md:justify-center space-x-3 sm:border-transparent pl-6">
              <Button size="sm" onClick={() => navigate("/")}>
                Go Back Home
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
