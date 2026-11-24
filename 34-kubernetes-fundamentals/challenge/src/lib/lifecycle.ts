/**
 * Tracks whether the process is draining. Kubernetes sends SIGTERM and, at about the same
 * time, starts removing the pod from Service endpoints. Those two things race, so we:
 *
 *   1. flip readiness to 503 immediately (no NEW traffic should be routed here),
 *   2. keep serving for SHUTDOWN_DELAY_MS while kube-proxy / ingress catch up,
 *   3. stop accepting connections and let in-flight requests finish,
 *   4. close the DB pool and exit, well before terminationGracePeriodSeconds (default 30s).
 */
export interface Lifecycle {
  isShuttingDown(): boolean;
  beginShutdown(): void;
}

export function createLifecycle(): Lifecycle {
  let draining = false;
  return {
    isShuttingDown: () => draining,
    beginShutdown: () => {
      draining = true;
    },
  };
}
