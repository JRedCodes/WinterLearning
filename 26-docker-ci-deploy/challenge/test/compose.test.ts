import { describe, expect, it } from "vitest";
import { asRecord, readYaml } from "./helpers/files.js";

function services() {
  return asRecord(readYaml("docker-compose.yml").services, "services");
}
function service(name: string) {
  const all = services();
  if (!(name in all)) throw new Error(`docker-compose.yml has no "${name}" service yet (TODO 3)`);
  return asRecord(all[name], `services.${name}`);
}

/** environment can be a mapping or a list of KEY=value strings. */
function env(svc: Record<string, unknown>): Record<string, string> {
  const e = svc.environment;
  if (Array.isArray(e)) {
    return Object.fromEntries(e.map((line) => String(line).split(/=(.*)/s).slice(0, 2) as [string, string]));
  }
  if (e && typeof e === "object") return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, String(v)]));
  return {};
}

/** depends_on in long form: { postgres: { condition: service_healthy } } */
function condition(svc: Record<string, unknown>, dep: string): string | undefined {
  const d = svc.depends_on;
  if (Array.isArray(d)) return d.includes(dep) ? "service_started" : undefined;
  if (d && typeof d === "object") {
    const entry = (d as Record<string, unknown>)[dep];
    if (entry && typeof entry === "object") return String((entry as Record<string, unknown>).condition ?? "service_started");
  }
  return undefined;
}

/** "15s", "1m30s", "500ms" -> milliseconds */
function durationMs(value: unknown): number {
  const text = String(value);
  let total = 0;
  for (const [, n, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    total += Number(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit as "ms" | "s" | "m" | "h"];
  }
  return total;
}

function expectDbUrlOnComposeNetwork(svc: Record<string, unknown>, name: string) {
  const url = env(svc).DATABASE_URL;
  expect(url, `services.${name}.environment.DATABASE_URL`).toBeDefined();
  const parsed = new URL(url!);
  expect(parsed.hostname, `${name} must reach Postgres by its service name, not localhost`).toBe("postgres");
  expect(parsed.port || "5432", "inside the network Postgres listens on 5432 (5433 is the host port)").toBe("5432");
  expect(parsed.pathname).toBe("/wl_26");
}

describe("docker-compose.yml (TODO 3)", () => {
  it("still has the postgres service used by `make up`", () => {
    const pg = service("postgres");
    expect(pg.image).toBe("postgres:16-alpine");
    expect(pg.ports).toContain("5433:5432");
    expect(pg.healthcheck, "postgres needs its healthcheck so others can wait for service_healthy").toBeDefined();
  });

  it("has a migrate service built from the Dockerfile that runs once postgres is healthy", () => {
    const m = service("migrate");
    expect(m.build, "migrate should be built from your Dockerfile (build: .)").toBeDefined();
    const command = Array.isArray(m.command) ? m.command.join(" ") : String(m.command ?? "");
    expect(command, "run the migrations, e.g. node dist/db/migrateCli.js").toMatch(/migrate/i);
    expect(condition(m, "postgres")).toBe("service_healthy");
    expectDbUrlOnComposeNetwork(m, "migrate");
    expect(m.restart ?? "no", "a one-off job must not restart forever").toMatch(/^(no|on-failure(:\d+)?)$/);
  });

  it("has an api service built from the Dockerfile and published on port 3000", () => {
    const api = service("api");
    expect(api.build, "api should be built from your Dockerfile (build: .)").toBeDefined();
    const ports = (Array.isArray(api.ports) ? api.ports : []).map(String);
    expect(ports.some((p) => /(^|:)3000:3000$/.test(p) || p === "3000"), "publish 3000:3000").toBe(true);
    expectDbUrlOnComposeNetwork(api, "api");
  });

  it("starts the api only after postgres is healthy AND migrations succeeded", () => {
    const api = service("api");
    expect(condition(api, "postgres")).toBe("service_healthy");
    expect(condition(api, "migrate"), "wait for the migrate job to exit 0").toBe("service_completed_successfully");
  });

  it("gives the api a stop_grace_period longer than its drain timeout", () => {
    const api = service("api");
    expect(api.stop_grace_period, "set stop_grace_period on the api").toBeDefined();
    const drain = Number(env(api).SHUTDOWN_TIMEOUT_MS ?? 10_000);
    expect(
      durationMs(api.stop_grace_period),
      `stop_grace_period must exceed SHUTDOWN_TIMEOUT_MS (${drain}ms) or Docker SIGKILLs mid-drain`,
    ).toBeGreaterThan(drain);
  });
});
