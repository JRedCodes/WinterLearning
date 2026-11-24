/** TODO 7 and 8: RUNBOOK.md and DECISIONS.md. */
import { describe, expect, it } from "vitest";
import { NAMES } from "./helpers/expected.js";
import { loadManifests, mainContainer, mustFind, readText } from "./helpers/manifests.js";

const runbook = readText("RUNBOOK.md");
/** Only the commands inside fenced code blocks count: prose saying "run kind" isn't a runbook. */
const commands = [...runbook.matchAll(/```(?:bash|sh|shell|console)?\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");

function apiImage(): string {
  return mainContainer(mustFind(loadManifests(), "Deployment", NAMES.api)).image ?? "<no image>";
}

describe("RUNBOOK.md (TODO 7)", () => {
  it("still has the template's section headings", () => {
    for (const h of ["Prerequisites", "Create the cluster", "Build and load the image", "Deploy", "Verify", "Rolling update", "Rollback", "Clean up"]) {
      expect(runbook, `missing heading "${h}"`).toMatch(new RegExp(`^##+ .*${h}`, "mi"));
    }
  });

  it("has no TODO placeholders left", () => {
    expect(runbook).not.toMatch(/TODO/);
  });

  it("creates a kind cluster", () => {
    expect(commands).toMatch(/kind create cluster/);
  });

  it("builds the exact image the Deployment uses and loads it into kind", () => {
    const image = apiImage();
    const esc = image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(commands, `docker build -t ${image} ...`).toMatch(new RegExp(`docker build[^\\n]*-t\\s+${esc}(\\s|$)`, "m"));
    expect(commands, `kind load docker-image ${image} ...`).toMatch(new RegExp(`kind load docker-image\\s+${esc}(\\s|$)`, "m"));
  });

  it("applies the k8s/ folder and waits for things to become ready", () => {
    expect(commands).toMatch(/kubectl apply -f k8s\/?/);
    expect(commands).toMatch(/kubectl[^\n]*(rollout status|wait)/);
    expect(commands, "wait for the migration Job to complete").toMatch(new RegExp(`(job/${NAMES.migrateJob}|job\\.batch/${NAMES.migrateJob})`));
  });

  it("reaches the API with port-forward to the Service", () => {
    expect(commands).toMatch(new RegExp(`kubectl[^\\n]*port-forward[^\\n]*(svc|service)/${NAMES.api}`));
    expect(commands).toMatch(/curl[^\n]*(readyz|whoami|kudos)/);
  });

  it("performs a rolling update to a new image tag and watches it", () => {
    expect(commands).toMatch(new RegExp(`kubectl[^\\n]*set image[^\\n]*deploy(ment)?/${NAMES.api}`));
    expect(commands).toMatch(/kubectl[^\n]*rollout status/);
  });

  it("can inspect history and roll back", () => {
    expect(commands).toMatch(/kubectl[^\n]*rollout history/);
    expect(commands).toMatch(/kubectl[^\n]*rollout undo/);
  });

  it("cleans up", () => {
    expect(commands).toMatch(/kind delete cluster/);
  });
});

describe("DECISIONS.md (TODO 8)", () => {
  const text = readText("DECISIONS.md").replace(/<!--[\s\S]*?-->/g, "");
  const section = (h: string) => {
    const m = new RegExp(`^## ${h}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(text);
    return m?.[1]?.trim() ?? "";
  };

  it.each(["Context", "Options considered", "Decision", "Consequences"])("section %s has real content (>= 20 words)", (h) => {
    const words = section(h).split(/\s+/).filter(Boolean).length;
    expect(words, `## ${h} has ${words} words`).toBeGreaterThanOrEqual(20);
  });
});
