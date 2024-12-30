import pocketbase from "@/lib/pocketbase";
import { useQuery } from "react-query";

const fetchSettings = async () => {
  const response = await pocketbase.collection("settings").getList(1, 1);
  const data = await response;

  return data;
};

export default function useSettings() {
  const settingsQuery = useQuery(["settings"], fetchSettings, {
    keepPreviousData: true,
    retry: false,
    staleTime: Infinity,
  });

  return {
    isLoading: settingsQuery.isLoading,
    settings: settingsQuery?.data?.items[0],
  };
}
