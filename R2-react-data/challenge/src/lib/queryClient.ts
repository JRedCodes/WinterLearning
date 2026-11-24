import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/errors";

/** Retry network errors and 5xx a couple of times, but never 4xx: they won't fix themselves. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status !== undefined && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // data is "fresh" for 30s: no refetch on every mount/focus
        retry: shouldRetry,
      },
      mutations: {
        retry: false, // writes are retried by the user, deliberately
      },
    },
  });
}
