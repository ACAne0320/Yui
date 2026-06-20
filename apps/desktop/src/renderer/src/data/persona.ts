import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemoryScope } from "@yui/contracts";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function usePersonaConfig() {
  return useQuery({ queryKey: queryKeys.personaConfig, queryFn: () => api.persona.getConfig() });
}

export function useSetPersonaConfig() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.persona.setConfig,
    onSuccess: (config) => client.setQueryData(queryKeys.personaConfig, config),
  });
}

export function useSoul() {
  return useQuery({ queryKey: queryKeys.soul, queryFn: () => api.persona.getSoul() });
}

export function useSaveSoul() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.persona.saveSoul,
    onSuccess: (soul) => client.setQueryData(queryKeys.soul, soul),
  });
}

export function useMemoryEntries(scope: MemoryScope, cwd?: string) {
  return useQuery({
    queryKey: queryKeys.memory(scope, cwd),
    queryFn: () => api.persona.listMemory({ scope, cwd }),
  });
}

export function useSaveMemory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.persona.saveMemory,
    onSuccess: () => client.invalidateQueries({ queryKey: ["persona", "memory"] }),
  });
}

export function useDeleteMemory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.persona.deleteMemory,
    onSuccess: () => client.invalidateQueries({ queryKey: ["persona", "memory"] }),
  });
}
