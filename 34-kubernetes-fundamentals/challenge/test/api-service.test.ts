/** TODO 4: the API Service, and the probes actually hitting real routes. */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InMemoryKudosRepository } from "../src/repositories/kudosRepository.js";
import { KudosService } from "../src/services/kudosService.js";
import { NAMES } from "./helpers/expected.js";
import {
  all,
  loadManifests,
  mainContainer,
  mustFind,
  podLabels,
  resolveContainerPort,
  selectorMatches,
} from "./helpers/manifests.js";

const docs = loadManifests();

describe(`Service ${NAMES.api} (TODO 4)`, () => {
  it("is a ClusterIP Service (reach it locally with kubectl port-forward)", () => {
    const svc = mustFind(docs, "Service", NAMES.api);
    expect(svc.spec?.type ?? "ClusterIP").toBe("ClusterIP");
    expect(svc.spec?.clusterIP, "clusterIP: None would make it headless").not.toBe("None");
  });

  it("selects the API pods", () => {
    const svc = mustFind(docs, "Service", NAMES.api);
    const d = mustFind(docs, "Deployment", NAMES.api);
    expect(
      selectorMatches(svc.spec?.selector, podLabels(d)),
      `Service selector ${JSON.stringify(svc.spec?.selector)} doesn't match pod labels ${JSON.stringify(podLabels(d))}`,
    ).toBe(true);
  });

  it("does NOT select any other workload's pods (e.g. a shared `app: kudos` label would also hit Postgres)", () => {
    const svc = mustFind(docs, "Service", NAMES.api);
    for (const kind of ["Deployment", "StatefulSet"]) {
      for (const w of all(docs, kind)) {
        if (kind === "Deployment" && w.metadata?.name === NAMES.api) continue;
        expect(selectorMatches(svc.spec?.selector, podLabels(w)), `Service ${NAMES.api} also matches ${kind}/${w.metadata?.name}`).toBe(false);
      }
    }
  });

  it("exposes port 80 and targets the container's http port", () => {
    const svc = mustFind(docs, "Service", NAMES.api);
    const c = mainContainer(mustFind(docs, "Deployment", NAMES.api));
    const port = (svc.spec?.ports ?? [])[0];
    expect(port?.port).toBe(80);
    const target = resolveContainerPort(c, port?.targetPort ?? port?.port);
    expect(target, `targetPort ${port?.targetPort} doesn't resolve to a containerPort`).toBe(resolveContainerPort(c, "http"));
  });
});

describe("probes point at routes that exist in the app (TODO 3/4)", () => {
  const app = createApp({
    kudos: new KudosService(new InMemoryKudosRepository()),
    checkDatabase: async () => true,
    isShuttingDown: () => false,
    appVersion: "test",
  });

  it("every httpGet probe path answers 200 on a healthy app", async () => {
    const c = mainContainer(mustFind(docs, "Deployment", NAMES.api));
    const probes = ["livenessProbe", "readinessProbe", "startupProbe"]
      .map((k) => c[k]?.httpGet?.path as string | undefined)
      .filter((p): p is string => Boolean(p));
    expect(probes.length, "no httpGet probes defined").toBeGreaterThanOrEqual(2);
    for (const path of probes) {
      const res = await request(app).get(path);
      expect(res.status, `probe path ${path} returned ${res.status}`).toBe(200);
    }
  });
});
