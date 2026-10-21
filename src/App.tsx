import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "react-query";
import { Toaster } from "@/components/ui/sonner";
import { RolesProvider } from "./context/roles.context";
import { AuthProvider } from "./context/auth.context";
import { I18nProvider } from "./i18n";

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
      <I18nProvider>
        <AuthProvider>
          <RolesProvider>
            <Outlet />
          </RolesProvider>
        </AuthProvider>
      </I18nProvider>

      <Toaster
        duration={1000}
        position="bottom-right"
        className="flex h-full w-full flex-col items-center justify-center"
      />
    </QueryClientProvider>
  );
}
