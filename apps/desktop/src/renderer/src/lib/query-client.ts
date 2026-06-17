import { QueryClient } from "@tanstack/react-query";

// Module-level singleton so that non-React code (e.g. the chat conversation
// service) can read cached server state via `queryClient.getQueryData(...)`
// without being bound to a component's render cycle. `AppProviders` hands this
// same instance to `QueryClientProvider`, so hooks and services share one cache.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});
