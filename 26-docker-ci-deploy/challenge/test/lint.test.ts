import { describe, expect, it } from "vitest";
import { lint } from "../scripts/lintRules.js";
import { projectPath } from "./helpers/files.js";

describe("architecture lint (what `npm run lint` checks in CI)", () => {
  it("src/ passes the lint rules", async () => {
    expect(await lint(projectPath("src"))).toEqual([]);
  });
});
