/**
 * The incident: the Deployment, Service, ConfigMap and Secret in broken/.
 * Tests are named after what must be TRUE, not after the bug, so they don't give the game away.
 */
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { EnvSchema } from "../src/config.js";
import { InMemoryKudosRepository } from "../src/repositories/kudosRepository.js";
import { KudosService } from "../src/services/kudosService.js";
import { NAMES } from "./helpers/expected.js";
import {
  envValue,
  loadManifests,
  mainContainer,
  mustFind,
  parseQuantity,
  podLabels,
  resolveContainerPort,
  resolveEnv,
  ROOT,
  selectorMatches,
} from "./helpers/manifests.js";

const docs = loadManifests();
const localDocs = loadManifests(path.join(ROOT, "local"));
const deployment = () => mustFind(docs, "Deployment", NAMES.api);
const container = () => mainContainer(deployment());
const appPort = () => Number(envValue(resolveEnv(container(), docs).get("PORT")) ?? EnvSchema.shape.PORT.parse(undefined));

describe("sanity: things that were never broken (keep them that way)", () => {
  it("all the objects are still there", () => {
    for (const [kind, name] of [
      ["Namespace", NAMES.namespace],
      ["ConfigMap", NAMES.configMap],
      ["Secret", NAMES.secret],
      ["Deployment", NAMES.api],
      ["Service", NAMES.api],
      ["Ingress", NAMES.api],
    ] as const) {
      expect(() => mustFind(docs, kind, name)).not.toThrow();
    }
  });

  it("the Deployment's own selector still matches its pod template", () => {
    expect(selectorMatches(deployment().spec?.selector?.matchLabels, podLabels(deployment()))).toBe(true);
  });

  it("zero-downtime rollout settings and security context are intact", () => {
    expect(String(deployment().spec?.strategy?.rollingUpdate?.maxUnavailable)).toBe("0");
    expect(container().securityContext?.readOnlyRootFilesystem).toBe(true);
    expect(deployment().spec?.template?.spec?.securityContext?.runAsNonRoot).toBe(true);
  });
});

describe("the Service routes to the API pods", () => {
  it("its selector matches the Deployment's pod labels", () => {
    const svc = mustFind(docs, "Service", NAMES.api);
    expect(
      selectorMatches(svc.spec?.selector, podLabels(deployment())),
      `Service selector ${JSON.stringify(svc.spec?.selector)} vs pod labels ${JSON.stringify(podLabels(deployment()))}`,
    ).toBe(true);
  });

  it("the container declares the port the app actually listens on (PORT from the ConfigMap)", () => {
    const http = (container().ports ?? []).find((p: { name?: string }) => p.name === "http");
    expect(http, "keep a container port named http").toBeDefined();
    expect(http.containerPort).toBe(appPort());
  });

  it("its targetPort reaches that port", () => {
    const svc = mustFind(docs, "Service", NAMES.api);
    const port = (svc.spec?.ports ?? [])[0];
    expect(resolveContainerPort(container(), port?.targetPort ?? port?.port)).toBe(appPort());
  });
});

describe("the pods become ready", () => {
  const app = createApp({
    kudos: new KudosService(new InMemoryKudosRepository()),
    checkDatabase: async () => true,
    isShuttingDown: () => false,
    appVersion: "test",
  });

  it("the readiness probe checks /readyz and the liveness probe /healthz", () => {
    expect(container().readinessProbe?.httpGet?.path).toBe("/readyz");
    expect(container().livenessProbe?.httpGet?.path).toBe("/healthz");
  });

  it("every probe targets the port the app listens on", () => {
    for (const k of ["startupProbe", "readinessProbe", "livenessProbe"]) {
      const probe = container()[k]?.httpGet;
      if (!probe) continue;
      expect(resolveContainerPort(container(), probe.port), `${k} port`).toBe(appPort());
    }
  });

  it("every probe path answers 200 on a healthy app", async () => {
    for (const k of ["startupProbe", "readinessProbe", "livenessProbe"]) {
      const p = container()[k]?.httpGet?.path;
      if (!p) continue;
      const res = await request(app).get(p);
      expect(res.status, `${k} ${p} -> ${res.status}`).toBe(200);
    }
  });
});

describe("the pods stay alive", () => {
  it("memory limit leaves room for Node.js (>= 128Mi) and requests <= limits", () => {
    const r = container().resources;
    expect(parseQuantity(r?.limits?.memory)).toBeGreaterThanOrEqual(128 * 1024 ** 2);
    expect(parseQuantity(r?.requests?.memory)).toBeLessThanOrEqual(parseQuantity(r?.limits?.memory));
    expect(parseQuantity(r?.requests?.cpu)).toBeLessThanOrEqual(parseQuantity(r?.limits?.cpu));
  });
});

describe("the pods can start (every referenced config exists)", () => {
  it("every env var from a ConfigMap or Secret resolves to an existing key", () => {
    for (const [name, src] of resolveEnv(container(), docs)) {
      if (src.from === "configMap" || src.from === "secret") {
        expect(src.value, `${name} -> ${src.from} ${src.name} key "${src.key}" doesn't exist`).toBeDefined();
      }
    }
  });

  it("DB_PASSWORD comes from the Secret, and the local migrate Job can read it too", () => {
    const api = resolveEnv(container(), docs).get("DB_PASSWORD");
    expect(api?.from).toBe("secret");
    expect(envValue(api)).toBeDefined();
    const job = mainContainer(mustFind(localDocs, "Job", "kudos-migrate"));
    const jobPw = resolveEnv(job, [...docs, ...localDocs]).get("DB_PASSWORD");
    expect(envValue(jobPw), "local/migrate-job.yaml references kudos-db key DB_PASSWORD: fix the Secret, not just the Deployment").toBeDefined();
  });

  it("the password matches the one local Postgres was initialised with", () => {
    const pw = envValue(resolveEnv(container(), docs).get("DB_PASSWORD"));
    const admin = mustFind(localDocs, "Secret", "postgres-admin");
    expect(pw).toBe(admin.stringData?.POSTGRES_PASSWORD);
  });
});
