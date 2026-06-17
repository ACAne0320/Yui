import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useExtensionCatalog() {
  return useQuery({ queryKey: queryKeys.extensions, queryFn: () => api.extensions.list() });
}

export function useSetExtensionEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.extensions.setEnabled,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.extensions }),
  });
}

export function useDeleteExtension() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.extensions.delete,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.extensions }),
  });
}

export function useAddExtensionPath() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.extensions.addPath,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.extensions }),
  });
}

export function useRemoveExtensionPath() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.extensions.removePath,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.extensions }),
  });
}
