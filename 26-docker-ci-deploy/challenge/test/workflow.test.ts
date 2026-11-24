import { describe, expect, it } from "vitest";
import { asRecord, readYaml } from "./helpers/files.js";

const FILE = ".github/workflows/ci.yml";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

function workflow() {
  return readYaml(FILE);
}
function jobs() {
  return asRecord(workflow().jobs, "jobs");
}
function findTestJob(): [string, Record<string, unknown>] {
  const entry = Object.entries(jobs()).find(([, job]) => {
    const services = (job as Record<string, unknown>)?.services as Record<string, unknown> | undefined;
    return services && "postgres" in services;
  });
  if (!entry) throw new Error(`${FILE}: no job with a "postgres" service container yet`);
  return [entry[0], asRecord(entry[1], `jobs.${entry[0]}`)];
}
function steps(job: Record<string, unknown>): Step[] {
  return Array.isArray(job.steps) ? (job.steps as Step[]) : [];
}
const needsList = (job: Record<string, unknown>) =>
  Array.isArray(job.needs) ? job.needs.map(String) : job.needs ? [String(job.needs)] : [];

describe("CI workflow (TODO 4)", () => {
  it("runs on pushes to main and on pull requests", () => {
    const on = workflow().on;
    // `on: [push, pull_request]` or a mapping with those keys both work
    const triggers = Array.isArray(on) ? on.map(String) : typeof on === "string" ? [on] : Object.keys(asRecord(on, "on"));
    expect(triggers).toContain("push");
    expect(triggers).toContain("pull_request");
    if (!Array.isArray(on) && typeof on === "object" && on) {
      const push = (on as Record<string, unknown>).push as Record<string, unknown> | null;
      if (push?.branches) expect(push.branches).toContain("main");
    }
  });

  it("restricts the GITHUB_TOKEN to read-only (least privilege)", () => {
    const permissions = workflow().permissions;
    expect(permissions, "add a top-level `permissions:` block").toBeDefined();
    if (typeof permissions === "string") expect(permissions).toBe("read-all");
    else expect(asRecord(permissions, "permissions").contents).toBe("read");
  });

  it("has a test job with a healthy postgres:16-alpine service container", () => {
    const [, job] = findTestJob();
    expect(job["runs-on"]).toBe("ubuntu-latest");
    const pg = asRecord(asRecord(job.services, "services").postgres, "services.postgres");
    expect(pg.image).toBe("postgres:16-alpine");
    expect(asRecord(pg.env, "services.postgres.env").POSTGRES_PASSWORD, "the image refuses to start without a password").toBeDefined();
    expect((pg.ports as unknown[] | undefined)?.map(String), "map 5433:5432 so the default DATABASE_URL works").toContain("5433:5432");
    expect(String(pg.options ?? ""), "add --health-cmd so steps wait for a ready database").toMatch(/--health-cmd/);
  });

  it("checks out the code and sets up Node 22 with the npm cache", () => {
    const [, job] = findTestJob();
    const s = steps(job);
    const checkout = s.findIndex((x) => x.uses?.startsWith("actions/checkout@"));
    const setup = s.findIndex((x) => x.uses?.startsWith("actions/setup-node@"));
    expect(checkout, "use actions/checkout").toBeGreaterThanOrEqual(0);
    expect(setup, "use actions/setup-node after checkout").toBeGreaterThan(checkout);
    const opts = s[setup]!.with ?? {};
    expect(String(opts["node-version"])).toMatch(/^22(\.x)?$/);
    expect(opts.cache, "cache: npm makes repeat runs much faster").toBe("npm");
  });

  it("runs npm ci, lint, typecheck and tests in that order", () => {
    const [, job] = findTestJob();
    const runs = steps(job).map((x) => x.run ?? "");
    const at = (re: RegExp) => runs.findIndex((r) => re.test(r));
    const ci = at(/\bnpm ci\b/);
    const lint = at(/\bnpm run lint\b/);
    const typecheck = at(/\bnpm run typecheck\b/);
    const test = at(/\bnpm (run )?test\b/);
    expect(ci, "install with `npm ci`").toBeGreaterThanOrEqual(0);
    expect(lint, "`npm run lint` after npm ci").toBeGreaterThan(ci);
    expect(typecheck, "`npm run typecheck` after lint").toBeGreaterThan(lint);
    expect(test, "`npm test` last").toBeGreaterThan(typecheck);
    expect(runs.join("\n"), "CI should use npm ci, never npm install").not.toMatch(/\bnpm (install|i)\b/);
  });

  it("builds the Docker image tagged with the commit SHA, only after tests pass", () => {
    const [testJobId] = findTestJob();
    const dockerJob = Object.entries(jobs()).find(([id, job]) => {
      if (id === testJobId) return false;
      return needsList(asRecord(job, `jobs.${id}`)).includes(testJobId);
    });
    expect(dockerJob, `add a job with \`needs: ${testJobId}\``).toBeDefined();
    const s = steps(asRecord(dockerJob![1], "docker job"));
    const builds = s.some(
      (x) =>
        (/\bdocker (build|buildx build)\b/.test(x.run ?? "") && /github\.sha/.test(x.run ?? "")) ||
        (x.uses?.startsWith("docker/build-push-action@") && /github\.sha/.test(String(x.with?.tags ?? ""))),
    );
    expect(builds, "build the image with a tag that includes ${{ github.sha }}").toBe(true);
  });
});
