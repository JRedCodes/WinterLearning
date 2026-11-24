/** TODO 7 and 8: HorizontalPodAutoscaler and PodDisruptionBudget. */
import { describe, expect, it } from "vitest";
import { NAMES } from "./helpers/expected.js";
import { loadManifests, mainContainer, mustFind, parseQuantity, podLabels, selectorMatches } from "./helpers/manifests.js";

const docs = loadManifests();

describe(`HorizontalPodAutoscaler ${NAMES.api} (TODO 7)`, () => {
  const hpa = () => mustFind(docs, "HorizontalPodAutoscaler", NAMES.api);

  it("is autoscaling/v2 in the kudos namespace and targets the kudos-api Deployment", () => {
    expect(hpa().apiVersion).toBe("autoscaling/v2");
    expect(hpa().metadata?.namespace).toBe(NAMES.namespace);
    expect(hpa().spec?.scaleTargetRef).toMatchObject({ apiVersion: "apps/v1", kind: "Deployment", name: NAMES.api });
  });

  it("scales between 2 and 10 replicas", () => {
    expect(hpa().spec?.minReplicas).toBe(2);
    expect(hpa().spec?.maxReplicas).toBe(10);
  });

  it("targets 70% average CPU utilization", () => {
    const metrics: { type?: string; resource?: { name?: string; target?: { type?: string; averageUtilization?: number } } }[] =
      hpa().spec?.metrics ?? [];
    const cpu = metrics.find((m) => m.type === "Resource" && m.resource?.name === "cpu");
    expect(cpu, "add a Resource metric for cpu").toBeDefined();
    expect(cpu!.resource!.target).toMatchObject({ type: "Utilization", averageUtilization: 70 });
  });

  it("the Deployment keeps a CPU request (utilization is a percentage OF the request)", () => {
    const c = mainContainer(mustFind(docs, "Deployment", NAMES.api));
    expect(parseQuantity(c.resources?.requests?.cpu)).toBeGreaterThan(0);
  });

  it("the Deployment no longer sets spec.replicas (or every apply would fight the HPA)", () => {
    expect(mustFind(docs, "Deployment", NAMES.api).spec?.replicas).toBeUndefined();
  });
});

describe(`PodDisruptionBudget ${NAMES.api} (TODO 8)`, () => {
  const pdb = () => mustFind(docs, "PodDisruptionBudget", NAMES.api);

  it("is policy/v1 in the kudos namespace and selects exactly the API pods", () => {
    expect(pdb().apiVersion).toBe("policy/v1");
    expect(pdb().metadata?.namespace).toBe(NAMES.namespace);
    expect(selectorMatches(pdb().spec?.selector?.matchLabels, podLabels(mustFind(docs, "Deployment", NAMES.api)))).toBe(true);
  });

  it("sets exactly one of minAvailable / maxUnavailable", () => {
    const s = pdb().spec ?? {};
    expect([s.minAvailable, s.maxUnavailable].filter((v) => v !== undefined)).toHaveLength(1);
  });

  it("protects availability but still allows a drain when the HPA is at its minimum", () => {
    const s = pdb().spec ?? {};
    const min = mustFind(docs, "HorizontalPodAutoscaler", NAMES.api).spec?.minReplicas ?? 1;
    const pct = (v: unknown) => typeof v === "string" && v.endsWith("%");
    if (s.minAvailable !== undefined) {
      const need = pct(s.minAvailable) ? Math.ceil((parseInt(s.minAvailable, 10) / 100) * min) : Number(s.minAvailable);
      expect(need, "minAvailable must be at least 1").toBeGreaterThanOrEqual(1);
      expect(need, `minAvailable ${s.minAvailable} with ${min} replicas blocks every eviction`).toBeLessThan(min);
    } else {
      const allowed = pct(s.maxUnavailable) ? Math.floor((parseInt(s.maxUnavailable, 10) / 100) * min) : Number(s.maxUnavailable);
      expect(allowed, "maxUnavailable must allow at least one eviction").toBeGreaterThanOrEqual(1);
      expect(allowed, "maxUnavailable must keep at least one pod up").toBeLessThan(min);
    }
  });
});
