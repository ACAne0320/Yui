import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useProviders() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: () => api.auth.listProviders() });
}

export function useSetApiKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.auth.setApiKey,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.providers }),
        client.invalidateQueries({ queryKey: queryKeys.models }),
      ]);
    },
  });
}

export function useRemoveApiKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.auth.removeApiKey,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.providers }),
        client.invalidateQueries({ queryKey: queryKeys.models }),
      ]);
    },
  });
}

export function useBeginOAuthLogin() {
  return useMutation({ mutationFn: api.auth.beginOAuthLogin });
}

export function useOAuthLoginState(flowId: string | null) {
  return useQuery({
    queryKey: queryKeys.oauthLogin(flowId ?? ""),
    queryFn: () => api.auth.getOAuthLoginState({ flowId: flowId! }),
    enabled: Boolean(flowId),
    refetchInterval: (query) => (query.state.data?.status === "running" ? 500 : false),
  });
}

export function useRespondToOAuthLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.auth.respondToOAuthLogin,
    onSuccess: async (_result, input) => {
      await client.invalidateQueries({ queryKey: queryKeys.oauthLogin(input.flowId) });
    },
  });
}

export function useCancelOAuthLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.auth.cancelOAuthLogin,
    onSuccess: async (_result, input) => {
      await client.invalidateQueries({ queryKey: queryKeys.oauthLogin(input.flowId) });
    },
  });
}
