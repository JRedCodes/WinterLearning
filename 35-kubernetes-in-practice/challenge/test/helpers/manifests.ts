/**
 * Test helpers: load every YAML document in broken/ (multi-document files supported) and answer
 * the questions the API server and kubelet would ask: "which pods does this selector match?",
 * "what value will this env var have?", "which container port does this targetPort hit?".
 *
 * No cluster needed. This doesn't replace `kubectl apply --dry-run=server`, but it catches the
 * consistency bugs that dry-run happily accepts (selectors that match nothing, wrong ports...).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseAllDocuments } from "yaml";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const K8S_DIR = path.join(ROOT, "broken");

// Loose shapes: tests check fields defensively and fail with readable messages.
export type K8sObject = { apiVersion?: string; kind?: string; metadata?: any; spec?: any; data?: any; stringData?: any; type?: string } & Record<string, any>;
export type Container = Record<string, any>;

export interface LoadedDoc {
  file: string;
  obj: K8sObject;
}

export function manifestFiles(dir = K8S_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
}

export function loadManifests(dir = K8S_DIR): LoadedDoc[] {
  const out: LoadedDoc[] = [];
  for (const file of manifestFiles(dir)) {
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const doc of parseAllDocuments(text)) {
      if (doc.errors.length) {
        throw new Error(`YAML error in ${path.basename(dir)}/${file}: ${doc.errors[0]!.message}`);
      }
      const obj = doc.toJS() as K8sObject | null;
      if (obj === null || obj === undefined) continue; // comment-only document
      out.push({ file, obj });
    }
  }
  return out;
}

export function all(docs: LoadedDoc[], kind: string): K8sObject[] {
  return docs.filter((d) => d.obj.kind === kind).map((d) => d.obj);
}

export function find(docs: LoadedDoc[], kind: string, name: string): K8sObject | undefined {
  return docs.find((d) => d.obj.kind === kind && d.obj.metadata?.name === name)?.obj;
}

export function mustFind(docs: LoadedDoc[], kind: string, name: string): K8sObject {
  const obj = find(docs, kind, name);
  if (!obj) {
    const have = docs.map((d) => `${d.obj.kind}/${d.obj.metadata?.name} (${d.file})`).join(", ") || "nothing yet";
    throw new Error(`Expected a ${kind} named "${name}" in broken/*.yaml. Found: ${have}`);
  }
  return obj;
}

/** The pod template spec of a Deployment/StatefulSet/Job. */
export function podSpec(workload: K8sObject): any {
  const spec = workload.spec?.template?.spec;
  if (!spec) throw new Error(`${workload.kind}/${workload.metadata?.name} has no spec.template.spec`);
  return spec;
}

export function podLabels(workload: K8sObject): Record<string, string> {
  return workload.spec?.template?.metadata?.labels ?? {};
}

export function mainContainer(workload: K8sObject): Container {
  const containers: Container[] = podSpec(workload).containers ?? [];
  const c = containers[0];
  if (!c) throw new Error(`${workload.kind}/${workload.metadata?.name} has no containers`);
  return c;
}

/** True when every key/value in `selector` is present in `labels` (how matchLabels works). */
export function selectorMatches(selector: Record<string, string> | undefined, labels: Record<string, string>): boolean {
  if (!selector || Object.keys(selector).length === 0) return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

/** Resolve a probe/Service port (number or port name) to a containerPort number. */
export function resolveContainerPort(container: Container, port: number | string | undefined): number | undefined {
  if (port === undefined) return undefined;
  if (typeof port === "number") return port;
  if (/^\d+$/.test(port)) return Number(port);
  const named = (container.ports ?? []).find((p: { name?: string }) => p.name === port);
  return named?.containerPort;
}

/** Kubernetes quantity -> number (cores for CPU, bytes for memory). */
export function parseQuantity(q: string | number | undefined): number {
  if (q === undefined) return NaN;
  if (typeof q === "number") return q;
  const m = /^([0-9.]+)([a-zA-Z]*)$/.exec(q.trim());
  if (!m) return NaN;
  const n = Number(m[1]);
  const factors: Record<string, number> = {
    "": 1, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12,
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4,
  };
  const f = factors[m[2]!];
  return f === undefined ? NaN : n * f;
}

export type EnvSource =
  | { from: "value"; value: string }
  | { from: "configMap"; name: string; key: string; value: string | undefined }
  | { from: "secret"; name: string; key: string; value: string | undefined }
  | { from: "other" };

function configMapValue(docs: LoadedDoc[], name: string, key: string): string | undefined {
  const cm = find(docs, "ConfigMap", name);
  const v = cm?.data?.[key];
  return v === undefined ? undefined : String(v);
}

function secretValue(docs: LoadedDoc[], name: string, key: string): string | undefined {
  const s = find(docs, "Secret", name);
  if (!s) return undefined;
  if (s.stringData?.[key] !== undefined) return String(s.stringData[key]);
  if (s.data?.[key] !== undefined) return Buffer.from(String(s.data[key]), "base64").toString("utf8");
  return undefined;
}

/**
 * Every env var a container will see, and where it comes from. Mirrors kubelet precedence:
 * envFrom first (in order), then `env` entries override.
 */
export function resolveEnv(container: Container, docs: LoadedDoc[]): Map<string, EnvSource> {
  const env = new Map<string, EnvSource>();
  for (const src of container.envFrom ?? []) {
    const prefix: string = src.prefix ?? "";
    if (src.configMapRef?.name) {
      const cm = find(docs, "ConfigMap", src.configMapRef.name);
      for (const key of Object.keys(cm?.data ?? {})) {
        env.set(prefix + key, { from: "configMap", name: src.configMapRef.name, key, value: configMapValue(docs, src.configMapRef.name, key) });
      }
    }
    if (src.secretRef?.name) {
      const s = find(docs, "Secret", src.secretRef.name);
      const keys = new Set([...Object.keys(s?.data ?? {}), ...Object.keys(s?.stringData ?? {})]);
      for (const key of keys) {
        env.set(prefix + key, { from: "secret", name: src.secretRef.name, key, value: secretValue(docs, src.secretRef.name, key) });
      }
    }
  }
  for (const e of container.env ?? []) {
    if (!e?.name) continue;
    if (e.value !== undefined) env.set(e.name, { from: "value", value: String(e.value) });
    else if (e.valueFrom?.configMapKeyRef) {
      const { name, key } = e.valueFrom.configMapKeyRef;
      env.set(e.name, { from: "configMap", name, key, value: configMapValue(docs, name, key) });
    } else if (e.valueFrom?.secretKeyRef) {
      const { name, key } = e.valueFrom.secretKeyRef;
      env.set(e.name, { from: "secret", name, key, value: secretValue(docs, name, key) });
    } else env.set(e.name, { from: "other" });
  }
  return env;
}

export function envValue(src: EnvSource | undefined): string | undefined {
  if (!src) return undefined;
  return src.from === "other" ? undefined : src.value;
}

/** Names of env vars set via `env[].name` only (not envFrom). */
export function explicitEnvNames(container: Container): string[] {
  return (container.env ?? []).map((e: { name?: string }) => e.name).filter(Boolean);
}

export function readText(rel: string): string {
  const p = path.join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}
