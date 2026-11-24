import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function filesIn(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

describe("architecture: Kafka stays at the edge", () => {
  it.each(["domain", "producer", "consumer", "projection", "ops"])("src/%s does not import kafkajs", (dir) => {
    for (const file of filesIn(dir)) {
      const text = readFileSync(join(SRC, file), "utf8");
      expect(text, `${file} imports kafkajs: depend on the ports in messaging/types.ts instead`).not.toMatch(/from\s+["']kafkajs["']/);
    }
  });
});
