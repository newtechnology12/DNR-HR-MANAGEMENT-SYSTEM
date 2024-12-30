import pocketbase from "@/lib/pocketbase";
import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "react-query";
import { useAuth } from "./auth.context";

const RolesContext = createContext<any>(null);

const getRoles = async () => {
  const roles = await pocketbase.collection("roles").getFullList();
  return roles;
};

export function RolesProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, data: roles } = useQuery("roles", getRoles);

  const { user } = useAuth();

  const permitions = user?.role?.permitions?.filter((e) => e?.access === true);

  console.log('User:', user);
  console.log('Roles:', roles);
  console.log('Permitions:', permitions);

  const contextValue = useMemo(
    () => ({
      roles,
      isLoading,
      permitions,
    }),
    [roles, isLoading, permitions]
  );

  return (
    <RolesContext.Provider value={contextValue}>
      {children}
    </RolesContext.Provider>
  );
}

export function useRoles() {
  const context = useContext(RolesContext);
  if (!context) {
    throw new Error("useRoles must be used within an RolesProvider");
  }
  return context;
}