/**
 * TODO 9: the Helm chart. No Helm binary needed: Chart.yaml and values.yaml are parsed as YAML,
 * templates are checked as text (structure, references to values, use of the helpers).
 * Before you call it done, also run `helm lint ./chart` and `helm template kudos-api ./chart`
 * on your machine (see RUNBOOK.md).
 */
import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config.js";
import { blockBalance, chartFile, chartYaml, getPath, hasPath, templateCode, valuesRefs } from "./helpers/chart.js";
import { parseQuantity } from "./helpers/manifests.js";

const TEMPLATES = ["deployment", "service", "configmap", "ingress", "hpa", "pdb"].map((t) => `templates/${t}.yaml`);
const values = () => chartYaml("values.yaml") ?? {};

describe("Chart.yaml (provided)", () => {
  it("is a v2 application chart named kudos-api with semver version and appVersion", () => {
    const chart = chartYaml("Chart.yaml");
    expect(chart).toMatchObject({ apiVersion: "v2", name: "kudos-api", type: "application" });
    expect(String(chart.version)).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof chart.appVersion).toBe("string");
  });
});

describe("values.yaml (TODO 9)", () => {
  it.each([
    "image.repository", "image.tag", "image.pullPolicy", "containerPort", "service.port",
    "resources.requests.cpu", "resources.requests.memory", "resources.limits.memory",
    "ingress.enabled", "ingress.className", "ingress.host", "ingress.annotations",
    "autoscaling.enabled", "autoscaling.minReplicas", "autoscaling.maxReplicas", "autoscaling.targetCPUUtilizationPercentage",
    "podDisruptionBudget.enabled", "podDisruptionBudget.minAvailable",
    "database.existingSecret", "database.passwordKey",
  ])("defines %s", (key) => {
    expect(hasPath(values(), key), `values.yaml is missing ${key}`).toBe(true);
  });

  it("defaults match the fixed manifests: HPA 2–10 at 70% CPU, PDB minAvailable 1, all enabled", () => {
    const v = values();
    expect(getPath(v, "autoscaling")).toMatchObject({ enabled: true, minReplicas: 2, maxReplicas: 10, targetCPUUtilizationPercentage: 70 });
    expect(getPath(v, "podDisruptionBudget")).toMatchObject({ enabled: true, minAvailable: 1 });
    expect(getPath(v, "ingress.enabled")).toBe(true);
  });

  it("resources learned from the incident: memory limit >= 128Mi, requests <= limits", () => {
    const r = getPath(values(), "resources") as { requests?: Record<string, string>; limits?: Record<string, string> } | undefined;
    expect(parseQuantity(r?.limits?.memory)).toBeGreaterThanOrEqual(128 * 1024 ** 2);
    expect(parseQuantity(r?.requests?.memory)).toBeLessThanOrEqual(parseQuantity(r?.limits?.memory));
  });

  it("config keys are env vars the app reads (PORT comes from containerPort, so not here)", () => {
    const known = Object.keys(EnvSchema.shape);
    for (const key of Object.keys((getPath(values(), "config") as object) ?? {})) {
      expect(known, `config.${key} is not read by src/config.ts`).toContain(key);
      expect(key).not.toBe("PORT");
      expect(key).not.toMatch(/PASSWORD|SECRET|TOKEN/);
    }
  });
});

describe("templates: structure (TODO 9)", () => {
  it.each(TEMPLATES)("%s exists and contains a manifest", (t) => {
    const code = templateCode(t);
    expect(code, `${t} is empty or only comments`).toMatch(/apiVersion:/);
    expect(code).toMatch(/kind:/);
  });

  it.each(TEMPLATES)("%s has balanced {{ }} and if/range/with ... end blocks", (t) => {
    const b = blockBalance(templateCode(t));
    expect(b.braces[0], "unbalanced {{ }}").toBe(b.braces[1]);
    expect(b.opens, "every if/range/with needs an end").toBe(b.ends);
  });

  it.each(TEMPLATES)("%s only references values that exist in values.yaml", (t) => {
    for (const ref of valuesRefs(templateCode(t))) {
      expect(hasPath(values(), ref), `${t} uses .Values.${ref}, which values.yaml doesn't define`).toBe(true);
    }
  });

  it.each(TEMPLATES)("%s names objects with the fullname helper and never hard-codes a namespace", (t) => {
    const code = templateCode(t);
    expect(code).toMatch(/name: \{\{-? include "kudos-api\.fullname" \. -?\}\}/);
    expect(code, "helm install -n <ns> sets the namespace; don't hard-code it").not.toMatch(/^\s*namespace:/m);
    expect(code, "don't hard-code kudos-api as a name: use the helper").not.toMatch(/name: kudos-api\s*$/m);
  });
});

describe("templates: optional objects are switchable (TODO 9)", () => {
  it.each([
    ["templates/ingress.yaml", "ingress.enabled"],
    ["templates/hpa.yaml", "autoscaling.enabled"],
    ["templates/pdb.yaml", "podDisruptionBudget.enabled"],
  ])("%s is wrapped in {{- if .Values.%s }} ... {{- end }}", (t, key) => {
    const code = templateCode(t);
    const lines = code.split("\n").filter((l) => l.trim());
    expect(lines[0]).toMatch(new RegExp(`^\\{\\{-? if \\.Values\\.${key.replace(".", "\\.")} -?\\}\\}$`));
    expect(lines.at(-1)).toMatch(/^\{\{-? end -?\}\}$/);
  });
});

describe("templates: deployment.yaml (TODO 9a)", () => {
  const code = () => templateCode("templates/deployment.yaml");

  it("only sets replicas when autoscaling is disabled", () => {
    expect(code()).toMatch(/\{\{-? if not \.Values\.autoscaling\.enabled -?\}\}\s*\n\s*replicas: \{\{ \.Values\.replicaCount \}\}\s*\n\s*\{\{-? end -?\}\}/);
    expect(code().match(/replicas:/g)?.length).toBe(1);
  });

  it("uses the selectorLabels helper for spec.selector and the pod template", () => {
    expect(code()).toMatch(/matchLabels:\s*\n\s*\{\{- include "kudos-api\.selectorLabels" \. \| nindent \d+ \}\}/);
    expect((code().match(/include "kudos-api\.(selectorLabels|labels)"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("builds the image from repository and tag, falling back to the chart's appVersion", () => {
    expect(code()).toMatch(/image: "\{\{ \.Values\.image\.repository \}\}:\{\{ \.Values\.image\.tag \| default \.Chart\.AppVersion \}\}"/);
    expect(code()).toMatch(/imagePullPolicy: \{\{ \.Values\.image\.pullPolicy \}\}/);
  });

  it("declares the http port from values and probes /readyz and /healthz on it", () => {
    expect(code()).toMatch(/name: http\s*\n\s*containerPort: \{\{ \.Values\.containerPort \}\}/);
    expect(code()).toMatch(/readinessProbe:[\s\S]*?path: \/readyz[\s\S]*?port: http/);
    expect(code()).toMatch(/livenessProbe:[\s\S]*?path: \/healthz[\s\S]*?port: http/);
  });

  it("wires the ConfigMap and the existing Secret", () => {
    expect(code()).toMatch(/configMapRef:\s*\n\s*name: \{\{ include "kudos-api\.fullname" \. \}\}/);
    expect(code()).toMatch(/secretKeyRef:\s*\n\s*name: \{\{ \.Values\.database\.existingSecret \}\}\s*\n\s*key: \{\{ \.Values\.database\.passwordKey \}\}/);
  });

  it("renders resources and both security contexts from values with toYaml", () => {
    for (const key of ["resources", "podSecurityContext", "securityContext"]) {
      expect(code()).toMatch(new RegExp(`toYaml \\.Values\\.${key} \\| nindent \\d+`));
    }
  });
});

describe("templates: ingress, hpa, pdb (TODO 9b–d)", () => {
  it("ingress routes / to this chart's Service on .Values.service.port", () => {
    const code = templateCode("templates/ingress.yaml");
    expect(code).toMatch(/apiVersion: networking\.k8s\.io\/v1/);
    expect(code).toMatch(/pathType: Prefix/);
    expect(code).toMatch(/service:\s*\n\s*name: \{\{ include "kudos-api\.fullname" \. \}\}\s*\n\s*port:\s*\n\s*number: \{\{ \.Values\.service\.port \}\}/);
    expect(code).toMatch(/\{\{-? if \.Values\.ingress\.className -?\}\}\s*\n\s*ingressClassName: \{\{ \.Values\.ingress\.className \}\}/);
  });

  it("hpa is autoscaling/v2 targeting this chart's Deployment with values for min, max and CPU", () => {
    const code = templateCode("templates/hpa.yaml");
    expect(code).toMatch(/apiVersion: autoscaling\/v2/);
    expect(code).toMatch(/kind: Deployment\s*\n\s*name: \{\{ include "kudos-api\.fullname" \. \}\}/);
    for (const v of ["minReplicas", "maxReplicas", "targetCPUUtilizationPercentage"]) {
      expect(code).toMatch(new RegExp(`\\.Values\\.autoscaling\\.${v}`));
    }
    expect(code).toMatch(/averageUtilization: \{\{ \.Values\.autoscaling\.targetCPUUtilizationPercentage \}\}/);
  });

  it("pdb is policy/v1 selecting this release's pods", () => {
    const code = templateCode("templates/pdb.yaml");
    expect(code).toMatch(/apiVersion: policy\/v1/);
    expect(code).toMatch(/minAvailable: \{\{ \.Values\.podDisruptionBudget\.minAvailable \}\}/);
    expect(code).toMatch(/matchLabels:\s*\n\s*\{\{- include "kudos-api\.selectorLabels" \. \| nindent \d+ \}\}/);
  });
});

describe("chart hygiene", () => {
  it("keeps the provided helpers", () => {
    const helpers = chartFile("templates/_helpers.tpl");
    for (const name of ["kudos-api.fullname", "kudos-api.labels", "kudos-api.selectorLabels"]) {
      expect(helpers).toContain(`define "${name}"`);
    }
  });
});
