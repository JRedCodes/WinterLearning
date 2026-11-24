/** TODO 5: Postgres inside the cluster, wired consistently to the API's config. */
import { describe, expect, it } from "vitest";
import { NAMES } from "./helpers/expected.js";
import {
  envValue,
  find,
  loadManifests,
  mainContainer,
  mustFind,
  podLabels,
  podSpec,
  resolveContainerPort,
  resolveEnv,
  selectorMatches,
  type K8sObject,
} from "./helpers/manifests.js";

const docs = loadManifests();

function postgresWorkload(): K8sObject {
  const w = find(docs, "StatefulSet", NAMES.postgres) ?? find(docs, "Deployment", NAMES.postgres);
  if (!w) throw new Error(`Expected a StatefulSet (or Deployment + PVC) named "${NAMES.postgres}" in k8s/`);
  return w;
}

describe("Postgres workload (TODO 5)", () => {
  it("runs exactly one postgres:16-alpine replica", () => {
    const w = postgresWorkload();
    expect(w.spec?.replicas ?? 1).toBe(1);
    expect(mainContainer(w).image).toBe("postgres:16-alpine");
  });

  it("selector matches its pod labels", () => {
    const w = postgresWorkload();
    expect(selectorMatches(w.spec?.selector?.matchLabels, podLabels(w))).toBe(true);
  });

  it("stores data on a persistent volume mounted at /var/lib/postgresql/data", () => {
    const w = postgresWorkload();
    const c = mainContainer(w);
    const mount = (c.volumeMounts ?? []).find((m: { mountPath?: string }) => m.mountPath === "/var/lib/postgresql/data");
    expect(mount, "mount a volume at /var/lib/postgresql/data").toBeDefined();
    if (w.kind === "StatefulSet") {
      const claims = (w.spec?.volumeClaimTemplates ?? []).map((t: K8sObject) => t.metadata?.name);
      expect(claims, "the mount must use one of the volumeClaimTemplates").toContain(mount.name);
      const tpl = w.spec.volumeClaimTemplates.find((t: K8sObject) => t.metadata?.name === mount.name);
      expect(tpl.spec?.resources?.requests?.storage, "volumeClaimTemplate needs resources.requests.storage").toBeTruthy();
      expect(tpl.spec?.accessModes).toContain("ReadWriteOnce");
    } else {
      const vol = (podSpec(w).volumes ?? []).find((v: { name?: string }) => v.name === mount.name);
      const claim = vol?.persistentVolumeClaim?.claimName;
      expect(claim, "the volume must reference a PersistentVolumeClaim").toBeTruthy();
      mustFind(docs, "PersistentVolumeClaim", claim);
      expect(w.spec?.strategy?.type, "a Deployment with an RWO volume must use strategy Recreate").toBe("Recreate");
    }
  });

  it("sets PGDATA to a subdirectory of the mount (some volumes contain lost+found, which initdb rejects)", () => {
    const pgdata = envValue(resolveEnv(mainContainer(postgresWorkload()), docs).get("PGDATA"));
    expect(pgdata, "set PGDATA, e.g. /var/lib/postgresql/data/pgdata").toMatch(/^\/var\/lib\/postgresql\/data\/.+/);
  });

  it("has a readinessProbe using pg_isready", () => {
    const probe = mainContainer(postgresWorkload()).readinessProbe;
    const cmd = (probe?.exec?.command ?? []).join(" ");
    expect(cmd).toMatch(/pg_isready/);
  });

  it("sets resource requests and a memory limit", () => {
    const r = mainContainer(postgresWorkload()).resources;
    expect(r?.requests?.cpu).toBeDefined();
    expect(r?.requests?.memory).toBeDefined();
    expect(r?.limits?.memory).toBeDefined();
  });
});

describe("Postgres Service (TODO 5)", () => {
  it(`a Service named ${NAMES.postgres} selects the postgres pods on port 5432`, () => {
    const svc = mustFind(docs, "Service", NAMES.postgres);
    const w = postgresWorkload();
    expect(selectorMatches(svc.spec?.selector, podLabels(w))).toBe(true);
    const port = (svc.spec?.ports ?? [])[0];
    expect(port?.port).toBe(5432);
    expect(resolveContainerPort(mainContainer(w), port?.targetPort ?? port?.port)).toBe(5432);
  });

  it("a StatefulSet's serviceName points at that Service, which is headless (clusterIP: None)", () => {
    const w = postgresWorkload();
    if (w.kind !== "StatefulSet") return;
    expect(w.spec?.serviceName).toBe(NAMES.postgres);
    expect(mustFind(docs, "Service", NAMES.postgres).spec?.clusterIP).toBe("None");
  });
});

describe("API and Postgres agree with each other (TODO 5)", () => {
  const apiEnv = () => resolveEnv(mainContainer(mustFind(docs, "Deployment", NAMES.api)), docs);
  const pgEnv = () => resolveEnv(mainContainer(postgresWorkload()), docs);

  it("POSTGRES_PASSWORD comes from the same Secret key as the API's DB_PASSWORD", () => {
    const pg = pgEnv().get("POSTGRES_PASSWORD");
    const api = apiEnv().get("DB_PASSWORD");
    expect(pg?.from, "POSTGRES_PASSWORD must come from a secretKeyRef").toBe("secret");
    expect(pg && pg.from === "secret" ? `${pg.name}/${pg.key}` : undefined).toBe(
      api && api.from === "secret" ? `${api.name}/${api.key}` : "api DB_PASSWORD is not from a Secret",
    );
  });

  it("the database user and name Postgres creates are the ones the API connects with", () => {
    const pgUser = envValue(pgEnv().get("POSTGRES_USER")) ?? "postgres";
    const pgDb = envValue(pgEnv().get("POSTGRES_DB")) ?? pgUser;
    expect(envValue(apiEnv().get("DB_USER"))).toBe(pgUser);
    expect(envValue(apiEnv().get("DB_NAME"))).toBe(pgDb);
  });

  it("DB_HOST is the postgres Service's DNS name and DB_PORT its port", () => {
    const ns = mustFind(docs, "Deployment", NAMES.api).metadata?.namespace;
    const host = envValue(apiEnv().get("DB_HOST"));
    const valid = [NAMES.postgres, `${NAMES.postgres}.${ns}`, `${NAMES.postgres}.${ns}.svc`, `${NAMES.postgres}.${ns}.svc.cluster.local`];
    expect(valid, `DB_HOST=${host}`).toContain(host);
    expect(envValue(apiEnv().get("DB_PORT"))).toBe("5432");
  });
});
