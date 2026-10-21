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
  const { user } = useAuth();

  const {
    isLoading,
    data: roles = [],
    error,
  } = useQuery("roles", getRoles, {
    enabled: Boolean(user),
    retry: false,
  });

  const permitions = user?.role?.permitions?.filter((e) => e?.access === true);

  const canPerform = (permition: string) => {
    return permitions?.find((e) => e?.name === permition)?.access;
  };

  const contextValue = useMemo(
    () => ({
      roles,
      isLoading: Boolean(user) && isLoading,
      error,
      permitions,
      canPerform,
    }),
    [roles, isLoading, error, permitions, canPerform, user]
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
