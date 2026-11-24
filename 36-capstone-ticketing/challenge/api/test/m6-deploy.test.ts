import { existsSync, readdirSync, readFileSync } from "node:fs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";
import { closeTestContext, createTestContext, resetState, type TestContext } from "./helpers/context.js";

const CHALLENGE_DIR = new URL("../../", import.meta.url);
const K8S_DIR = new URL("k8s/", CHALLENGE_DIR);
const DOCKERFILE = new URL("api/Dockerfile", CHALLENGE_DIR);

interface K8sObject {
  kind: string;
  metadata: { name: string; labels?: Record<string, string> };
  spec?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function loadManifests(): K8sObject[] {
  if (!existsSync(K8S_DIR)) return [];
  const files = readdirSync(K8S_DIR).filter((f) => /\.ya?ml$/.test(f));
  return files.flatMap((f) =>
    parseAllDocuments(readFileSync(new URL(f, K8S_DIR), "utf8"))
      .map((d) => d.toJS() as K8sObject | null)
      .filter((o): o is K8sObject => o !== null && typeof o === "object" && "kind" in o),
  );
}

describe("M6 · observability endpoint", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
    await resetState(ctx);
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it("GET /metrics exposes Prometheus metrics, labelled by route template (not raw URL)", async () => {
    await request(ctx.app).get("/healthz");
    await request(ctx.app).get("/events/00000000-0000-0000-0000-000000000000");
    const res = await request(ctx.app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("http_request_duration_seconds");
    expect(res.text).toMatch(/route="\/events\/:id"/);
    expect(res.text).not.toContain("00000000-0000-0000-0000-000000000000");
  });
});

describe("M6 · Dockerfile & Kubernetes manifests", () => {
  it("api/Dockerfile is multi-stage and runs as a non-root user", () => {
    expect(existsSync(DOCKERFILE), "missing challenge/api/Dockerfile").toBe(true);
    const text = readFileSync(DOCKERFILE, "utf8");
    expect(text.match(/^FROM\s+/gim)?.length ?? 0, "use at least two stages").toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/^FROM\s+\S+\s+AS\s+\w+/im);
    const user = text.match(/^USER\s+(\S+)/im)?.[1];
    expect(user, "add a USER instruction").toBeDefined();
    expect(["root", "0"]).not.toContain(user);
  });

  it("k8s/ has an api Deployment with probes, resources and config from ConfigMap/Secret", () => {
    const objects = loadManifests();
    const deployments = objects.filter((o) => o.kind === "Deployment");
    const api = deployments.find((d) => /api/.test(d.metadata.name));
    expect(api, "a Deployment whose name contains 'api'").toBeDefined();
    expect(api!.spec.replicas).toBeGreaterThanOrEqual(2);
    const container = api!.spec.template.spec.containers[0];
    expect(container.readinessProbe?.httpGet?.path).toBe("/readyz");
    expect(container.livenessProbe?.httpGet?.path).toBe("/healthz");
    expect(container.resources?.requests).toBeDefined();
    expect(container.resources?.limits).toBeDefined();
    const envFrom = JSON.stringify(container.envFrom ?? []) + JSON.stringify(container.env ?? []);
    expect(envFrom).toContain("configMap");
    expect(envFrom).toContain("secret");
  });

  it("k8s/ has a Service that selects the api pods, a worker Deployment and a migration Job", () => {
    const objects = loadManifests();
    const api = objects.find((o) => o.kind === "Deployment" && /api/.test(o.metadata.name));
    const podLabels: Record<string, string> = api?.spec?.template?.metadata?.labels ?? {};
    const service = objects.find((o) => o.kind === "Service" && /api/.test(o.metadata.name));
    expect(service, "a Service whose name contains 'api'").toBeDefined();
    const selector: Record<string, string> = service!.spec.selector ?? {};
    expect(Object.keys(selector).length).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(selector)) expect(podLabels[k], `pod label ${k}`).toBe(v);

    expect(
      objects.some((o) => o.kind === "Deployment" && /worker/.test(o.metadata.name)),
      "a Deployment whose name contains 'worker' (outbox relay, sweeper, notifications)",
    ).toBe(true);
    const job = objects.find((o) => o.kind === "Job");
    expect(job, "a Job that runs migrations").toBeDefined();
    expect(JSON.stringify(job!.spec.template.spec.containers[0])).toMatch(/migrate/);
  });
});
