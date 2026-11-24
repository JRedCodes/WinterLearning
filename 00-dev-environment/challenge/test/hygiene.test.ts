import { describe, expect, it } from "vitest";
import { isIgnored, parseGitignore } from "./helpers/gitignore.js";
import { readProjectFile } from "./helpers/files.js";

function rules() {
  return parseGitignore(readProjectFile(".gitignore"));
}

describe(".gitignore (TODO 3)", () => {
  it.each([
    ["node_modules/", "installed dependencies"],
    ["node_modules/pg/package.json", "files inside node_modules"],
    ["dist/", "build output"],
    [".env", "local secrets"],
    [".env.local", "local secret overrides"],
    ["npm-debug.log", "npm debug logs"],
    [".DS_Store", "macOS junk"],
  ])("ignores %s (%s)", (path) => {
    expect(isIgnored(rules(), path), `${path} should be ignored`).toBe(true);
  });

  it.each([
    [".env.example", "the documented template is meant to be committed"],
    ["src/checkServices.ts", "source code"],
    ["package.json", "the manifest"],
    ["docker-compose.yml", "the compose file"],
    ["Makefile", "the Makefile"],
  ])("does NOT ignore %s (%s)", (path) => {
    expect(isIgnored(rules(), path), `${path} must NOT be ignored`).toBe(false);
  });
});

describe(".nvmrc (TODO 3)", () => {
  it("pins Node 22 so `nvm use` picks the right version", () => {
    const content = readProjectFile(".nvmrc").trim();
    expect(content, ".nvmrc should contain just the version, e.g. 22").toMatch(/^v?22(\.\d+){0,2}$/);
  });
});
