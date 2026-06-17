import { useQuery } from "@tanstack/react-query";
import { api } from "@renderer/lib/api";
import { queryKeys } from "./keys";

export function useSessions() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: () => api.sessions.list() });
}

export function useSessionInfo(sessionPath?: string) {
  return useQuery({
    queryKey: queryKeys.sessionInfo(sessionPath ?? ""),
    queryFn: () => api.sessions.getInfo({ sessionPath: sessionPath! }),
    enabled: Boolean(sessionPath),
  });
}

export function useSessionHistory(sessionPath?: string) {
  return useQuery({
    queryKey: queryKeys.sessionHistory(sessionPath ?? ""),
    queryFn: () => api.sessions.getHistory({ sessionPath: sessionPath! }),
    enabled: Boolean(sessionPath),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}
