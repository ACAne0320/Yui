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

/** The working directories that have project memory, for the settings switcher. */
export function useMemoryProjects() {
  return useQuery({
    queryKey: queryKeys.memoryProjects,
    queryFn: () => api.persona.listMemoryProjects(),
  });
}

// Saving or deleting can add/empty a project, so refresh the project list (and
// its per-cwd entry counts) alongside the entries.
function invalidateMemory(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["persona", "memory"] });
  void client.invalidateQueries({ queryKey: queryKeys.memoryProjects });
}

export function useSaveMemory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.persona.saveMemory,
    onSuccess: () => invalidateMemory(client),
  });
}

export function useDeleteMemory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.persona.deleteMemory,
    onSuccess: () => invalidateMemory(client),
  });
}
