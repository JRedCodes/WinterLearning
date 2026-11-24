import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));

// Vitest strips types without checking them, so a separate step must run the
// real compiler. This test runs `tsc --noEmit` on src/ AND test/, which
// includes the type-level tests in test/types/*.test-d.ts.
describe("type check", () => {
  it("tsc --noEmit passes (src and the type-level tests in test/types)", async () => {
    let output = "";
    let exitCode = 0;
    try {
      await run(process.execPath, [tsc, "--noEmit", "--pretty", "false", "-p", root], { cwd: root });
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: number };
      output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      exitCode = e.code ?? 1;
    }
    const lines = output.trim().split("\n");
    const shown = lines.slice(0, 40).join("\n");
    const more = lines.length > 40 ? `\n... and ${lines.length - 40} more lines (run \`npm run typecheck\`)` : "";
    expect(exitCode, `The compiler reported errors:\n\n${shown}${more}\n`).toBe(0);
  });
});
