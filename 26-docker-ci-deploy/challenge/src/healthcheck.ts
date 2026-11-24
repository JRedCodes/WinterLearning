/**
 * Used by the Dockerfile's HEALTHCHECK: `node dist/healthcheck.js`.
 * Slim/distroless images often have no curl or wget, but they always have node.
 * Exit code 0 = healthy, 1 = unhealthy. It checks liveness (/healthz), not readiness.
 */
import { loadConfig } from "./config.js";

const { port } = loadConfig();

try {
  const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(2_000) });
  process.exitCode = res.ok ? 0 : 1;
} catch {
  process.exitCode = 1;
}
