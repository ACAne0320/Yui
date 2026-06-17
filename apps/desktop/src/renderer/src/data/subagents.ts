import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useSubagents() {
  return useQuery({ queryKey: queryKeys.subagents, queryFn: () => api.subagents.list() });
}

export function useSaveSubagent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.subagents.save,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.subagents }),
  });
}

export function useDeleteSubagent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.subagents.delete,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.subagents }),
  });
}
