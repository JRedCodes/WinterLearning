import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

async function sourceFiles(dir = SRC): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? sourceFiles(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat().filter((f) => f.endsWith(".ts"));
}

const rel = (f: string) => relative(SRC, f).replaceAll("\\", "/");

describe("architecture", () => {
  it("only src/config.ts reads process.env", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (rel(file) === "config.ts") continue;
      if ((await readFile(file, "utf8")).includes("process.env")) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it("only db/ and repositories/ (and the composition root) know about Postgres", async () => {
    const allowed = (f: string) => f.startsWith("db/") || f.startsWith("repositories/") || f === "server.ts";
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      const src = await readFile(file, "utf8");
      const touchesPg = /from\s+["']pg["']/.test(src) || /pgTaskRepository|\/db\//.test(src);
      if (touchesPg && !allowed(rel(file))) offenders.push(rel(file));
    }
    expect(offenders, "services, controllers, routes and domain must not import pg or db code").toEqual([]);
  });
});
