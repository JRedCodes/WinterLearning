import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { execForm, healthcheckCommand, parseDockerfile, splitStages, type Stage } from "./helpers/dockerfile.js";
import { projectPath, readProjectFile } from "./helpers/files.js";

function load() {
  const instructions = parseDockerfile(readProjectFile("Dockerfile"));
  const stages = splitStages(instructions);
  if (stages.length === 0) throw new Error("Dockerfile has no FROM instruction yet (TODO 1)");
  return { instructions, stages, final: stages[stages.length - 1]! };
}

const runs = (stage: Stage) => stage.instructions.filter((i) => i.keyword === "RUN").map((i) => i.args);
const indexOf = (stage: Stage, pred: (keyword: string, args: string) => boolean) =>
  stage.instructions.findIndex((i) => pred(i.keyword, i.args));
const omitsDev = (cmd: string) => /npm ci\b.*(--omit[= ]dev|--only[= ]prod|--production)/.test(cmd) || /npm prune\b.*(--omit[= ]dev|--production)/.test(cmd);

describe("Dockerfile (TODO 1)", () => {
  it("is a multi-stage build with a named build stage", () => {
    const { stages } = load();
    expect(stages.length, "use at least two stages: build + runtime").toBeGreaterThanOrEqual(2);
    const build = stages.find((s) => s.name === "build");
    expect(build, "name a stage `build`: FROM node:22-alpine AS build").toBeDefined();
    expect(build!.index, "the build stage can't be the final stage").toBeLessThan(stages.length - 1);
  });

  it("pins every base image to Node 22 (no `latest`, no untagged images)", () => {
    const { stages } = load();
    const named = new Set(stages.map((s) => s.name).filter(Boolean));
    for (const s of stages) {
      if (named.has(s.base.toLowerCase())) continue; // FROM <earlier stage>
      expect(s.base, `stage ${s.index} base image`).toMatch(/^node:22([.-][\w.-]+)?(@sha256:[a-f0-9]+)?$/);
    }
  });

  it("installs dependencies with npm ci before copying the source (layer caching)", () => {
    const { stages } = load();
    const build = stages.find((s) => s.name === "build")!;
    const copyManifests = indexOf(build, (k, a) => k === "COPY" && /package(\*|-lock)?\.json/.test(a) && !/\bsrc\b|^\.\s/.test(a));
    const npmCi = indexOf(build, (k, a) => k === "RUN" && /\bnpm ci\b/.test(a));
    const copySource = indexOf(build, (k, a) => k === "COPY" && (/(^|\s)\.\/?\s+\S+$/.test(a) || /\bsrc\b/.test(a)));
    expect(copyManifests, "COPY package.json package-lock.json ./ in the build stage").toBeGreaterThan(0);
    expect(npmCi, "RUN npm ci in the build stage").toBeGreaterThan(copyManifests);
    expect(copySource, "copy the source (src/ or .) AFTER npm ci").toBeGreaterThan(npmCi);
    expect(runs(build).some((r) => /npm run build|\btsc\b/.test(r)), "compile TypeScript in the build stage").toBe(true);
  });

  it("never uses `npm install` (npm ci is reproducible: it installs exactly the lockfile)", () => {
    const { stages } = load();
    for (const s of stages) {
      for (const r of runs(s)) expect(r, `stage ${s.name ?? s.index}`).not.toMatch(/\bnpm (install|i)\b/);
    }
  });

  it("ships only production dependencies in the final stage", () => {
    const { stages, final } = load();
    const installsHere = runs(final).some(omitsDev);
    const copied = final.instructions
      .filter((i) => i.keyword === "COPY" && /--from=/.test(i.args) && /node_modules/.test(i.args))
      .map((i) => /--from=(\S+)/.exec(i.args)![1]!.toLowerCase());
    const copiedFromProdStage = copied.some((from) => {
      const source = stages.find((s) => s.name === from || String(s.index) === from);
      return source !== undefined && runs(source).some(omitsDev);
    });
    expect(
      installsHere || copiedFromProdStage,
      "final stage needs `RUN npm ci --omit=dev`, or COPY --from a stage that ran it",
    ).toBe(true);
  });

  it("copies the compiled app and the migrations into the final stage", () => {
    const { final } = load();
    const copies = final.instructions.filter((i) => i.keyword === "COPY").map((i) => i.args);
    expect(copies.some((a) => /--from=\S+/.test(a) && /\bdist\b/.test(a)), "COPY --from=build /app/dist ./dist").toBe(true);
    expect(copies.some((a) => /\bmigrations\b/.test(a)), "the migrate service needs migrations/ in the image").toBe(true);
    expect(copies.some((a) => /\bsrc\b/.test(a) && !/--from/.test(a)), "don't ship TypeScript sources in the final image").toBe(false);
  });

  it("sets NODE_ENV=production and exposes port 3000", () => {
    const { final } = load();
    const envs = final.instructions.filter((i) => i.keyword === "ENV").map((i) => i.args);
    expect(envs.some((a) => /NODE_ENV[= ]"?production"?/.test(a)), "ENV NODE_ENV=production").toBe(true);
    expect(final.instructions.some((i) => i.keyword === "EXPOSE" && /\b3000\b/.test(i.args)), "EXPOSE 3000").toBe(true);
  });

  it("runs as a non-root user", () => {
    const { final } = load();
    const userIdx = final.instructions.map((i) => i.keyword).lastIndexOf("USER");
    expect(userIdx, "add a USER instruction to the final stage").toBeGreaterThan(0);
    const user = final.instructions[userIdx]!.args.split(":")[0]!.trim();
    expect(["root", "0"], `USER ${user} is still root`).not.toContain(user);
    const cmdIdx = final.instructions.map((i) => i.keyword).lastIndexOf("CMD");
    expect(userIdx, "USER must come before CMD").toBeLessThan(cmdIdx === -1 ? Infinity : cmdIdx);
  });

  it("has a HEALTHCHECK that uses node (no curl in slim images)", () => {
    const { final } = load();
    const hc = final.instructions.find((i) => i.keyword === "HEALTHCHECK");
    expect(hc, "add a HEALTHCHECK to the final stage").toBeDefined();
    const cmd = healthcheckCommand(hc!.args);
    expect(cmd, "HEALTHCHECK needs a CMD (not NONE)").toBeDefined();
    expect(cmd).toMatch(/dist\/healthcheck\.js/);
  });

  it("starts node directly with an exec-form CMD that points at a real build output", () => {
    const { final } = load();
    const cmd = final.instructions.filter((i) => i.keyword === "CMD").at(-1);
    const entry = final.instructions.some((i) => i.keyword === "ENTRYPOINT");
    expect(cmd, "add CMD [\"node\", \"dist/server.js\"]").toBeDefined();
    expect(entry, "keep it simple: no ENTRYPOINT needed here").toBe(false);
    const argv = execForm(cmd!.args);
    expect(argv, "use exec form (JSON array) so node is PID 1 and receives SIGTERM").toBeDefined();
    expect(argv![0]).toBe("node");
    expect(argv!.join(" "), "don't start through npm: it doesn't forward signals reliably").not.toMatch(/\bnpm\b/);
    const script = argv!.find((a) => a.endsWith(".js"));
    expect(script, "CMD should run a .js file from dist/").toMatch(/^(\.\/)?dist\//);
    const source = script!.replace(/^(\.\/)?dist\//, "src/").replace(/\.js$/, ".ts");
    expect(existsSync(projectPath(source)), `${script} would be compiled from ${source}, which doesn't exist`).toBe(true);
  });

  it("doesn't bake secrets into the image", () => {
    const { instructions } = load();
    for (const i of instructions.filter((x) => x.keyword === "ENV" || x.keyword === "ARG")) {
      expect(i.args, `line ${i.line}`).not.toMatch(/(PASSWORD|SECRET|TOKEN|DATABASE_URL)/i);
    }
  });
});

describe(".dockerignore (TODO 2)", () => {
  const patterns = () =>
    readProjectFile(".dockerignore")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.replace(/^\/|^\*\*\//, "").replace(/\/$/, ""));

  it.each([
    ["node_modules", ["node_modules"]],
    ["dist", ["dist"]],
    [".git", [".git"]],
    [".env", [".env", ".env*"]],
  ])("ignores %s", (_name, accepted) => {
    const list = patterns();
    expect(list.some((p) => accepted.includes(p)), `add one of ${accepted.join(" / ")} to .dockerignore`).toBe(true);
  });

  it("does not ignore the files the build needs", () => {
    const list = patterns().filter((p) => !p.startsWith("!"));
    for (const needed of ["package.json", "package-lock.json", "package*.json", "src", "migrations", "*.json", "tsconfig.json"]) {
      expect(list, `"${needed}" must reach the build context`).not.toContain(needed);
    }
  });
});
