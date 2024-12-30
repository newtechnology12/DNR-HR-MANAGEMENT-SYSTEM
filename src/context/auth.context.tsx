import pocketbase from "@/lib/pocketbase";
import authService from "@/services/auth.service";
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
} from "react";

interface User {
  id: any;
  names: any;
  photo: any;
  email: any;
  role: any;
  phone?: any;
  created_at?: any;
  status?: any;
  gender?: any;
  birth?: any;
  country?: any;
  branch?: any;
  national_id?: any;
  department?: any;
}

interface AuthContextValue {
  user: User | null;
  setCurrentUser: (userData: User) => void;
  logout: () => void;
  loaderUser: () => void;
  loading: boolean;
  relaodUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setloading] = useState(true);

  const setCurrentUser = (user) => {
    setloading(false);
    if (user) {
      setUser(user);
    } else {
      setUser(undefined);
    }
  };

  const logout = () => {
    setUser(null);
  };

  const relaodUser = async () => {
    await loaderUser();
  };

  const loaderUser = async () => {
    try {
      const authData: any = await authService.getCurrentUser();
      setCurrentUser(authData);
    } catch (error) {
      setCurrentUser(undefined);
      console.log(error);
    }
  };

  const contextValue = useMemo(
    () => ({
      user,
      setCurrentUser,
      logout,
      loading,
      loaderUser,
      relaodUser,
    }),
    [user, loading]
  );

  useEffect(() => {
    setTimeout(() => {
      loaderUser();
    }, 0);
  }, []);

  useEffect(() => {
    const unsubscribe = pocketbase.authStore.onChange((...all) => {
      const user = all[1];
      if (user) {
        if (user.expand) {
          setCurrentUser({
            names: user?.name,
            role: user?.role,
            email: user.email,
            id: user.id,
            photo: pocketbase.files.getUrl(user, user.record?.avatar),
            birth: user.birth,
            gender: user.gender,
            status: user.status,
            country: user.country,
            phone: user.phone,
            national_id: user.national_id,
            salary: user.salary,
            department: user.department,
            created: user.created,
            branch: user?.branch,
            joined_at: user?.joined_at,
            designation: user?.designation,
          });
        } else {
          loaderUser();
        }
      } else {
        setCurrentUser(undefined);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
