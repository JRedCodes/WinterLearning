/** The public entry point. */
import { describe, expect, it } from "vitest";
import { NAMES } from "./helpers/expected.js";
import { find, loadManifests, mustFind } from "./helpers/manifests.js";

const docs = loadManifests();

describe("the Ingress reaches the API", () => {
  const ingress = () => mustFind(docs, "Ingress", NAMES.api);
  const backends = () =>
    (ingress().spec?.rules ?? []).flatMap((r: { http?: { paths?: { backend?: { service?: { name?: string; port?: { number?: number; name?: string } } } }[] } }) =>
      (r.http?.paths ?? []).map((p) => p.backend?.service),
    );

  it("uses networking.k8s.io/v1 with a host rule and a pathType on every path", () => {
    expect(ingress().apiVersion).toBe("networking.k8s.io/v1");
    const rule = (ingress().spec?.rules ?? [])[0];
    expect(rule?.host).toBe("kudos.localtest.me");
    for (const p of rule?.http?.paths ?? []) expect(["Prefix", "Exact", "ImplementationSpecific"]).toContain(p.pathType);
  });

  it("every backend names a Service that exists", () => {
    expect(backends().length).toBeGreaterThan(0);
    for (const b of backends()) expect(find(docs, "Service", b?.name ?? ""), `no Service named ${b?.name}`).toBeDefined();
  });

  it("every backend port is a port the Service exposes (by number or by name)", () => {
    for (const b of backends()) {
      const svc = find(docs, "Service", b?.name ?? "");
      const ports: { port: number; name?: string }[] = svc?.spec?.ports ?? [];
      const ok = ports.some((p) => (b?.port?.number !== undefined ? p.port === b.port.number : p.name === b?.port?.name));
      expect(ok, `backend port ${JSON.stringify(b?.port)} vs Service ports ${JSON.stringify(ports.map((p) => ({ port: p.port, name: p.name })))}`).toBe(true);
    }
  });
});
