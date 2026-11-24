import { Router } from "express";

/** A named dependency check. `check()` resolves if the dependency is usable and throws otherwise. */
export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

export interface HealthOptions {
  checks: ReadinessCheck[];
  /** Max time a single check may take before it counts as failed. */
  timeoutMs: number;
}

type CheckResult = { ok: true } | { ok: false; error: string };

async function runChecks(checks: ReadinessCheck[]): Promise<Record<string, CheckResult>> {
  const entries = await Promise.all(
    checks.map(async (c): Promise<[string, CheckResult]> => {
      try {
        await c.check();
        return [c.name, { ok: true }];
      } catch (err) {
        return [c.name, { ok: false, error: err instanceof Error ? err.message : String(err) }];
      }
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Kubernetes calls these probes every few seconds:
 *   livenessProbe  -> GET /healthz
 *   readinessProbe -> GET /readyz
 */
export function healthRoutes(options: HealthOptions): Router {
  const router = Router();

  router.get("/healthz", async (_req, res) => {
    const checks = await runChecks(options.checks);
    const ok = Object.values(checks).every((c) => c.ok);
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "unavailable", checks });
  });

  router.get("/readyz", (_req, res) => {
    res.json({ status: "ok", checks: {} });
  });

  return router;
}
