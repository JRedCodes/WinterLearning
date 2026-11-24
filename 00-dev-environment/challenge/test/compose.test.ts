import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { readProjectFile } from "./helpers/files.js";

type Json = any;

function loadCompose(): Json {
  const doc = parse(readProjectFile("docker-compose.yml"));
  if (!doc || typeof doc !== "object") {
    throw new Error("docker-compose.yml is empty (only comments?). Write the compose file for TODO 1.");
  }
  return doc;
}

function service(name: string): Json {
  const svc = loadCompose().services?.[name];
  if (!svc) throw new Error(`docker-compose.yml has no service named "${name}" under services:`);
  return svc;
}

/**
 * Normalizes the short ("5433:5432", "127.0.0.1:5433:5432") and long ({ published, target })
 * port syntaxes into "host:container" strings.
 */
function portMappings(svc: Json): string[] {
  const ports: Json[] = svc.ports ?? [];
  return ports.map((p) => {
    if (typeof p === "object" && p !== null) return `${p.published}:${p.target}`;
    const parts = String(p).split("/")[0]!.split(":");
    return parts.slice(-2).join(":");
  });
}

/** Normalizes `environment` given as a map or as a ["KEY=value"] list. */
function envOf(svc: Json): Record<string, string> {
  const env = svc.environment ?? {};
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map((entry: string) => {
        const i = entry.indexOf("=");
        return [entry.slice(0, i), entry.slice(i + 1)];
      }),
    );
  }
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)]));
}

/** Healthcheck `test` can be a string or an array like ["CMD", "redis-cli", "ping"]. */
function healthcheckCommand(svc: Json): string {
  const test = svc.healthcheck?.test;
  if (!test) return "";
  return Array.isArray(test) ? test.join(" ") : String(test);
}

/** Volume entries can be "name:/path[:ro]" or { type, source, target }. */
function volumeMounts(svc: Json): Array<{ source: string; target: string }> {
  return (svc.volumes ?? []).map((v: Json) => {
    if (typeof v === "object" && v !== null) return { source: String(v.source), target: String(v.target) };
    const [source = "", target = ""] = String(v).split(":");
    return { source, target };
  });
}

describe("docker-compose.yml (TODO 1)", () => {
  it("is valid YAML with a services map", () => {
    const doc = loadCompose();
    expect(doc.services, "expected a top-level `services:` map").toBeTypeOf("object");
  });

  it("sets the project name to wl-00", () => {
    expect(loadCompose().name).toBe("wl-00");
  });

  it("does not use the obsolete top-level `version:` key", () => {
    expect(Object.keys(loadCompose()), "remove `version:`; Compose v2 ignores it and warns").not.toContain("version");
  });

  describe("postgres service", () => {
    it("uses the postgres:16-alpine image", () => {
      expect(service("postgres").image).toBe("postgres:16-alpine");
    });

    it("publishes host port 5433 to container port 5432", () => {
      expect(portMappings(service("postgres"))).toContain("5433:5432");
    });

    it("sets POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB", () => {
      expect(envOf(service("postgres"))).toMatchObject({
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "wl",
      });
    });

    it("stores data in a NAMED volume declared at the top level", () => {
      const mounts = volumeMounts(service("postgres"));
      const dataMount = mounts.find((m) => m.target === "/var/lib/postgresql/data");
      expect(dataMount, "mount something at /var/lib/postgresql/data").toBeDefined();
      expect(
        dataMount!.source.startsWith(".") || dataMount!.source.startsWith("/"),
        "use a named volume (e.g. pgdata), not a bind mount to a host path",
      ).toBe(false);
      const topLevel = loadCompose().volumes ?? {};
      expect(Object.keys(topLevel), `declare "${dataMount!.source}" under the top-level volumes:`).toContain(
        dataMount!.source,
      );
    });

    it("has a healthcheck using pg_isready with an interval", () => {
      const svc = service("postgres");
      expect(healthcheckCommand(svc)).toMatch(/pg_isready/);
      expect(svc.healthcheck.interval, "set healthcheck.interval (e.g. 2s)").toBeTruthy();
    });
  });

  describe("redis service", () => {
    it("uses the redis:7-alpine image", () => {
      expect(service("redis").image).toBe("redis:7-alpine");
    });

    it("publishes host port 6380 to container port 6379", () => {
      expect(portMappings(service("redis"))).toContain("6380:6379");
    });

    it("has a healthcheck using redis-cli ping with an interval", () => {
      const svc = service("redis");
      expect(healthcheckCommand(svc)).toMatch(/redis-cli\s+ping/);
      expect(svc.healthcheck.interval, "set healthcheck.interval (e.g. 2s)").toBeTruthy();
    });
  });
});
