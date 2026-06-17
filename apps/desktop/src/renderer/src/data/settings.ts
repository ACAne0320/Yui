import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useDefaults() {
  return useQuery({ queryKey: queryKeys.defaults, queryFn: () => api.settings.getDefaults() });
}

export function useSetDefaultModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.settings.setDefaultModel,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.defaults }),
  });
}

export function useSetDefaultThinkingLevel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.settings.setDefaultThinkingLevel,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.defaults }),
  });
}
