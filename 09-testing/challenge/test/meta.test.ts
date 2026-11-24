/**
 * GRADING TEST: don't edit.
 *
 * Runs YOUR test suite (every test file except this one) against:
 *   1. the real code in src/  -> must PASS
 *   2. each mutant in mutants/ -> must FAIL ("kill" the mutant)
 *
 * A mutant is a copy of one src file with a small, realistic change.
 * If your tests still pass with the change in place, they aren't checking
 * that behavior. `npm run mutants` prints the same report on its own.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatReport, runMutationCheck } from "../scripts/mutants.js";

const PROJECT_DIR = join(import.meta.dirname, "..");

describe.skipIf(process.env.WL_MUTANT_RUN === "1")("grading: mutation testing", () => {
  it("your tests pass on the real code and kill every mutant", async () => {
    const report = await runMutationCheck({ projectDir: PROJECT_DIR });
    const summary = formatReport(report);

    expect(report.baseline.passed, `Your test suite must pass on the real code first.\n\n${summary}`).toBe(true);
    const survivors = report.mutants.filter((m) => m.status !== "killed").map((m) => m.name);
    expect(survivors, `Some mutants survived your tests.\n\n${summary}`).toEqual([]);
  }, 280_000);
});
