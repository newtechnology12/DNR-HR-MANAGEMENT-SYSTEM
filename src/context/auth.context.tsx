import pocketbase from "@/lib/pocketbase";
import authService from "@/services/auth.service";
import { ImsMe, imsApi } from "@/lib/ims";
import React, {
  createContext,
  useCallback,
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
  /** Main role record; its `permitions` are the merged permissions of ALL the person's roles. */
  role: any;
  /** Every role the person holds (main + extra), with stable codes. */
  roles?: { id: string; name: string; code: string }[];
  permissions?: string[];
  phone?: any;
  created_at?: any;
  status?: any;
  gender?: any;
  birth?: any;
  country?: any;
  branch?: any;
  national_id?: any;
  department?: any;
  designation?: any;
}

interface AuthContextValue {
  user: User | null;
  setCurrentUser: (userData: User) => void;
  logout: () => void;
  loaderUser: () => void;
  loading: boolean;
  reloadUser: () => void;
  /** Server view of the signed-in person: merged permissions, roles, 2FA state, session timeout. */
  me: ImsMe | null;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [baseUser, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<ImsMe | null>(null);
  const [loading, setloading] = useState(true);
  // Id of the user whose /api/ims/me call finished (successfully or not).
  const [meSettledFor, setMeSettledFor] = useState<string | null>(null);

  const setCurrentUser = (user) => {
    setloading(false);
    if (user) {
      setUser(user);
    } else {
      setUser(undefined);
      setMe(null);
    }
  };

  const logout = () => {
    setUser(null);
    setMe(null);
  };

  const refreshMe = useCallback(async () => {
    const id = (pocketbase.authStore.model as any)?.id;
    if (!pocketbase.authStore.isValid || !id) return;
    try {
      setMe(await imsApi.me());
    } catch (e) {
      console.log(e);
    } finally {
      setMeSettledFor(id);
    }
  }, []);

  const reloadUser = async () => {
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

  // Load the merged permissions whenever the signed-in person changes.
  const userId = baseUser?.id;
  useEffect(() => {
    if (userId) refreshMe();
  }, [userId, refreshMe]);

  // The rest of the app reads user.role.permitions: give it the union of every role the person holds.
  const user = useMemo(() => {
    if (!baseUser) return baseUser;
    if (!me || me.id !== baseUser.id) return baseUser;
    return {
      ...baseUser,
      roles: me.roles,
      permissions: me.permissions,
      role: { ...(baseUser.role || {}), permitions: me.permissions.map((name) => ({ name, access: true })) },
    };
  }, [baseUser, me]);

  const contextValue = useMemo(
    () => ({
      user,
      setCurrentUser,
      logout,
      // Keep showing the loader until the merged permissions have arrived, so screens never flash "Access denied".
      loading: loading || (Boolean(baseUser) && meSettledFor !== baseUser?.id),
      loaderUser,
      reloadUser,
      me,
      refreshMe,
    }),
    [user, loading, me, meSettledFor, baseUser, refreshMe]
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
            role: user?.expand?.role,
            email: user.email,
            id: user.id,
            photo: pocketbase.files.getUrl(user, user?.avatar),
            birth: user.birth,
            gender: user.gender,
            status: user.status,
            country: user.country,
            phone: user.phone,
            national_id: user.national_id,
            salary: user.salary,
            department: user?.expand?.department?.name,
            created: user.created,
            branch: user?.expand?.branch?.name,
            joined_at: user?.joined_at,
            designation: user?.expand?.designation?.name,
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

/**
 * Permission helpers for screens: `can("approve_budgets")` or `can(["view_x", "manage_x"])` (any of).
 * Hiding a button is only cosmetic — the server enforces the same permission on every request.
 */
export function usePermissions() {
  const { user, me } = useAuth();
  const permissions = useMemo(() => new Set<string>(user?.permissions || (user?.role?.permitions || []).filter((p: any) => p?.access).map((p: any) => p.name)), [user]);
  const codes = useMemo(() => new Set((me?.roles || []).map((r) => r.code)), [me]);
  const can = useCallback((p: string | string[]) => (Array.isArray(p) ? p.some((x) => permissions.has(x)) : permissions.has(p)), [permissions]);
  const hasRole = useCallback((c: string | string[]) => (Array.isArray(c) ? c.some((x) => codes.has(x)) : codes.has(c)), [codes]);
  return { can, hasRole, permissions, roles: me?.roles || [], me };
}
