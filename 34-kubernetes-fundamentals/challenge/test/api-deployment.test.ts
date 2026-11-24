/** TODO 3: the API Deployment. */
import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config.js";
import { IMAGE_REPO, NAMES, REQUIRED_DB_ENV } from "./helpers/expected.js";
import {
  loadManifests,
  mainContainer,
  mustFind,
  parseQuantity,
  podLabels,
  podSpec,
  readText,
  resolveContainerPort,
  resolveEnv,
  envValue,
  selectorMatches,
} from "./helpers/manifests.js";

const docs = loadManifests();
const deployment = () => mustFind(docs, "Deployment", NAMES.api);
const container = () => mainContainer(deployment());

describe(`Deployment ${NAMES.api}: shape (TODO 3)`, () => {
  it("runs 3 replicas", () => {
    expect(deployment().spec?.replicas).toBe(3);
  });

  it("spec.selector.matchLabels matches the pod template labels", () => {
    const d = deployment();
    expect(
      selectorMatches(d.spec?.selector?.matchLabels, podLabels(d)),
      `selector ${JSON.stringify(d.spec?.selector?.matchLabels)} vs template labels ${JSON.stringify(podLabels(d))}`,
    ).toBe(true);
  });

  it("uses a RollingUpdate that never drops below the desired replica count (maxUnavailable 0, maxSurge >= 1)", () => {
    const strategy = deployment().spec?.strategy;
    expect(strategy?.type ?? "RollingUpdate").toBe("RollingUpdate");
    expect(String(strategy?.rollingUpdate?.maxUnavailable)).toMatch(/^0%?$/);
    const surge = String(strategy?.rollingUpdate?.maxSurge ?? "25%");
    expect(surge === "0" || surge === "0%", "maxSurge 0 with maxUnavailable 0 can never make progress").toBe(false);
  });
});

describe(`Deployment ${NAMES.api}: image (TODO 3)`, () => {
  it(`uses the ${IMAGE_REPO} image with an explicit, non-latest tag`, () => {
    const image: string = container().image ?? "";
    const [repo, tag] = image.split(":");
    expect(repo).toBe(IMAGE_REPO);
    expect(tag, "pin a tag such as 1.0.0").toBeTruthy();
    expect(tag).not.toBe("latest");
  });

  it("uses imagePullPolicy IfNotPresent or Never (the image only exists inside kind, not in a registry)", () => {
    expect(["IfNotPresent", "Never"]).toContain(container().imagePullPolicy);
  });
});

describe(`Deployment ${NAMES.api}: ports & probes (TODO 3)`, () => {
  it("declares a containerPort named http that equals the port the app listens on (PORT)", () => {
    const c = container();
    const http = (c.ports ?? []).find((p: { name?: string }) => p.name === "http");
    expect(http, "add ports: [{ name: http, containerPort: ... }]").toBeDefined();
    const env = resolveEnv(c, docs);
    const appPort = Number(envValue(env.get("PORT")) ?? EnvSchema.shape.PORT.parse(undefined));
    expect(http.containerPort, `the app listens on ${appPort}`).toBe(appPort);
  });

  it("has a readinessProbe: httpGet /readyz on the http port", () => {
    const c = container();
    const probe = c.readinessProbe?.httpGet;
    expect(probe?.path).toBe("/readyz");
    expect(resolveContainerPort(c, probe?.port)).toBe(resolveContainerPort(c, "http"));
  });

  it("has a livenessProbe: httpGet /healthz on the http port (NOT /readyz: a DB outage must not restart pods)", () => {
    const c = container();
    const probe = c.livenessProbe?.httpGet;
    expect(probe?.path).toBe("/healthz");
    expect(resolveContainerPort(c, probe?.port)).toBe(resolveContainerPort(c, "http"));
  });
});

describe(`Deployment ${NAMES.api}: resources (TODO 3)`, () => {
  it("sets CPU and memory requests and limits", () => {
    const r = container().resources;
    for (const path of ["requests.cpu", "requests.memory", "limits.cpu", "limits.memory"]) {
      const [a, b] = path.split(".") as [string, string];
      expect(r?.[a]?.[b], `resources.${path} is missing`).toBeDefined();
      expect(Number.isNaN(parseQuantity(r[a][b])), `resources.${path} "${r[a][b]}" is not a valid quantity`).toBe(false);
    }
  });

  it("requests are <= limits", () => {
    const r = container().resources;
    expect(parseQuantity(r?.requests?.cpu)).toBeLessThanOrEqual(parseQuantity(r?.limits?.cpu));
    expect(parseQuantity(r?.requests?.memory)).toBeLessThanOrEqual(parseQuantity(r?.limits?.memory));
  });

  it("memory limit leaves room for Node.js (>= 128Mi), and the CPU request is sane (<= 1 core)", () => {
    const r = container().resources;
    expect(parseQuantity(r?.limits?.memory)).toBeGreaterThanOrEqual(128 * 1024 ** 2);
    expect(parseQuantity(r?.requests?.cpu)).toBeLessThanOrEqual(1);
  });
});

describe(`Deployment ${NAMES.api}: security (TODO 3)`, () => {
  const effective = (key: string) => {
    const c = container();
    return c.securityContext?.[key] ?? podSpec(deployment()).securityContext?.[key];
  };

  it("runs as non-root with a NUMERIC runAsUser (the image's USER is the name `node`)", () => {
    expect(readText("Dockerfile")).toMatch(/^USER node$/m);
    expect(effective("runAsNonRoot")).toBe(true);
    const uid = effective("runAsUser");
    expect(Number.isInteger(uid) && uid > 0, `runAsUser must be a non-zero integer, got ${uid}`).toBe(true);
  });

  it("drops privileges: allowPrivilegeEscalation false, readOnlyRootFilesystem true, capabilities drop ALL", () => {
    const sc = container().securityContext ?? {};
    expect(sc.allowPrivilegeEscalation).toBe(false);
    expect(sc.readOnlyRootFilesystem).toBe(true);
    expect(sc.capabilities?.drop ?? []).toContain("ALL");
  });
});

describe(`Deployment ${NAMES.api}: configuration (TODO 3)`, () => {
  it("receives every DB setting the app needs", () => {
    const env = resolveEnv(container(), docs);
    for (const name of REQUIRED_DB_ENV) {
      expect(env.has(name), `${name} is not provided (envFrom the ConfigMap/Secret or env[].valueFrom)`).toBe(true);
      expect(envValue(env.get(name)), `${name} points at a ConfigMap/Secret key that doesn't exist`).toBeDefined();
    }
  });

  it("gets DB_PASSWORD from the Secret, never from a literal value or a ConfigMap", () => {
    const src = resolveEnv(container(), docs).get("DB_PASSWORD");
    expect(src?.from).toBe("secret");
    for (const e of container().env ?? []) {
      if (/PASSWORD|SECRET|TOKEN/i.test(e.name)) expect(e.value, `${e.name} must not be a literal value`).toBeUndefined();
    }
  });

  it("only sets env vars the app reads", () => {
    const known = Object.keys(EnvSchema.shape);
    for (const name of resolveEnv(container(), docs).keys()) {
      expect(known, `env var ${name} is not read by src/config.ts (typo?)`).toContain(name);
    }
  });
});
