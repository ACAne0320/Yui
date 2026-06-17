import { useQuery } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useProfile() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => api.profile.get() });
}
