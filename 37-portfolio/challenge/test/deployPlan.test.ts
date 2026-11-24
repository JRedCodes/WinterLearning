import { describe, it } from "vitest";
import { sections } from "./lib/markdown.js";
import { expectNoLeftovers, expectSection, loadDoc } from "./lib/expectations.js";

const FILE = "DEPLOY_PLAN.md";

describe(FILE, () => {
  const md = loadDoc(FILE);
  const h2 = sections(md, 2);

  it("chooses a target platform and explains why (and what was rejected)", () => {
    expectSection(FILE, h2, "Target platform", { minWords: 60 });
  });

  it("draws the deployed architecture", () => {
    expectSection(FILE, h2, "Architecture", { minWords: 30, needsMermaid: true });
  });

  it("plans the data stores (Postgres, Redis, Kafka) including backups", () => {
    expectSection(FILE, h2, "Data stores", { minWords: 50 });
  });

  it("covers secrets and configuration", () => {
    expectSection(FILE, h2, "Secrets", { minWords: 30 });
  });

  it("covers domain and TLS", () => {
    expectSection(FILE, h2, "Domain", { minWords: 20 });
  });

  it("describes the CI/CD pipeline including migrations", () => {
    expectSection(FILE, h2, "CI/CD", { minWords: 40 });
  });

  it("covers observability for the live demo", () => {
    expectSection(FILE, h2, "Observability", { minWords: 30 });
  });

  it("covers cost and abuse limits for a public demo", () => {
    expectSection(FILE, h2, "Cost", { minWords: 30 });
  });

  it("has a rollback plan", () => {
    expectSection(FILE, h2, "Rollback", { minWords: 40 });
  });

  it("has a launch checklist with at least 6 items", () => {
    expectSection(FILE, h2, "Launch checklist", { minCheckboxes: 6 });
  });

  it("has no leftover template placeholders", () => {
    expectNoLeftovers(FILE, md);
  });
});
