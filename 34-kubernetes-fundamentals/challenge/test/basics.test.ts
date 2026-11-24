/** TODO 1: the folder layout, the Namespace, and things every object needs. */
import { describe, expect, it } from "vitest";
import { all, loadManifests, manifestFiles } from "./helpers/manifests.js";

const docs = loadManifests();

const API_VERSIONS: Record<string, string> = {
  Namespace: "v1",
  ConfigMap: "v1",
  Secret: "v1",
  Service: "v1",
  PersistentVolumeClaim: "v1",
  Deployment: "apps/v1",
  StatefulSet: "apps/v1",
  Job: "batch/v1",
};

describe("k8s/ folder (TODO 1)", () => {
  it("contains YAML manifests with at least the 8 objects the challenge asks for", () => {
    expect(manifestFiles().length, "no .yaml files in k8s/").toBeGreaterThan(0);
    expect(docs.length, "k8s/*.yaml only contains comments so far").toBeGreaterThanOrEqual(8);
  });

  it("every document has apiVersion, kind and metadata.name", () => {
    for (const { file, obj } of docs) {
      expect(obj.apiVersion, `${file}: a document is missing apiVersion`).toBeTruthy();
      expect(obj.kind, `${file}: a document is missing kind`).toBeTruthy();
      expect(obj.metadata?.name, `${file}: ${obj.kind} is missing metadata.name`).toBeTruthy();
    }
  });

  it("uses the correct apiVersion for each kind", () => {
    for (const { file, obj } of docs) {
      const expected = API_VERSIONS[obj.kind ?? ""];
      if (expected) expect(obj.apiVersion, `${file}: ${obj.kind} should be apiVersion ${expected}`).toBe(expected);
    }
  });
});

describe("Namespace (TODO 1)", () => {
  it("defines exactly one Namespace", () => {
    expect(all(docs, "Namespace")).toHaveLength(1);
  });

  it("is in the alphabetically FIRST file, because `kubectl apply -f k8s/` applies files in name order", () => {
    const nsDoc = docs.find((d) => d.obj.kind === "Namespace");
    expect(nsDoc, "no Namespace yet").toBeDefined();
    expect(nsDoc!.file).toBe(manifestFiles()[0]);
  });

  it("every other object sets metadata.namespace to that Namespace", () => {
    const ns = all(docs, "Namespace")[0]?.metadata?.name;
    expect(ns, "no Namespace yet").toBeTruthy();
    for (const { file, obj } of docs) {
      if (obj.kind === "Namespace") continue;
      expect(obj.metadata?.namespace, `${file}: ${obj.kind}/${obj.metadata?.name} must set metadata.namespace: ${ns}`).toBe(ns);
    }
  });
});
