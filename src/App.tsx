import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "react-query";
import { Toaster } from "@/components/ui/sonner";
import { RolesProvider } from "./context/roles.context";
import { AuthProvider } from "./context/auth.context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RolesProvider>
          <Outlet />
        </RolesProvider>
      </AuthProvider>

      <Toaster
        duration={1000}
        position="bottom-right"
        className="flex h-full w-full flex-col items-center justify-center"
      />
    </QueryClientProvider>
  );
}
