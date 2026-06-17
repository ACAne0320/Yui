import { useQuery } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useModels() {
  return useQuery({ queryKey: queryKeys.models, queryFn: () => api.models.listAvailable() });
}
