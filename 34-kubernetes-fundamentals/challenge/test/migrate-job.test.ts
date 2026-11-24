/** TODO 6: the migration Job. */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAMES, REQUIRED_DB_ENV } from "./helpers/expected.js";
import { envValue, loadManifests, mainContainer, mustFind, podSpec, resolveEnv, ROOT } from "./helpers/manifests.js";

const docs = loadManifests();
const job = () => mustFind(docs, "Job", NAMES.migrateJob);

describe(`Job ${NAMES.migrateJob} (TODO 6)`, () => {
  it("runs the SAME image as the API (code and schema ship together)", () => {
    const api = mainContainer(mustFind(docs, "Deployment", NAMES.api));
    expect(mainContainer(job()).image).toBe(api.image);
    expect(["IfNotPresent", "Never"]).toContain(mainContainer(job()).imagePullPolicy);
  });

  it("runs the compiled migration CLI: node dist/db/migrateCli.js", () => {
    const c = mainContainer(job());
    const argv: string[] = [...(c.command ?? []), ...(c.args ?? [])];
    expect(argv[0], "command should start with node").toBe("node");
    const script = argv.find((a) => a.endsWith(".js"));
    expect(script, "pass the compiled script path, e.g. dist/db/migrateCli.js").toBeDefined();
    const source = script!.replace(/^(\.\/|\/app\/)?dist\//, "src/").replace(/\.js$/, ".ts");
    expect(existsSync(path.join(ROOT, source)), `${script} would come from ${source}, which doesn't exist`).toBe(true);
    expect(source).toMatch(/migrate/i);
  });

  it("does not restart forever: restartPolicy Never/OnFailure and a backoffLimit between 1 and 10", () => {
    expect(["Never", "OnFailure"]).toContain(podSpec(job()).restartPolicy);
    const limit = job().spec?.backoffLimit;
    expect(Number.isInteger(limit) && limit >= 1 && limit <= 10, `backoffLimit=${limit}`).toBe(true);
  });

  it("gets the same DB settings as the API", () => {
    const jobEnv = resolveEnv(mainContainer(job()), docs);
    const apiEnv = resolveEnv(mainContainer(mustFind(docs, "Deployment", NAMES.api)), docs);
    for (const name of REQUIRED_DB_ENV) {
      expect(envValue(jobEnv.get(name)), `Job env ${name}`).toBeDefined();
      expect(envValue(jobEnv.get(name)), `Job env ${name} differs from the API's`).toBe(envValue(apiEnv.get(name)));
    }
    expect(jobEnv.get("DB_PASSWORD")?.from).toBe("secret");
  });

  it("runs as non-root too", () => {
    const sc = { ...(podSpec(job()).securityContext ?? {}), ...(mainContainer(job()).securityContext ?? {}) };
    expect(sc.runAsNonRoot).toBe(true);
    expect(Number.isInteger(sc.runAsUser) && sc.runAsUser > 0).toBe(true);
  });
});
