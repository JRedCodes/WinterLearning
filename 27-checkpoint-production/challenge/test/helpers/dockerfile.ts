/**
 * A small Dockerfile parser: good enough to check structure, not a full implementation
 * of the Dockerfile grammar. Handles comments, parser directives, `\` line continuations
 * and splits instructions into stages at each FROM.
 */
export interface Instruction {
  keyword: string; // upper-cased, e.g. "RUN"
  args: string; // everything after the keyword, continuations joined with spaces
  line: number; // 1-based line where the instruction starts
}

export interface Stage {
  index: number;
  base: string; // image reference after FROM (flags stripped)
  name?: string; // the `AS name`, lower-cased
  instructions: Instruction[]; // including the FROM itself
}

export function parseDockerfile(text: string): Instruction[] {
  const out: Instruction[] = [];
  const lines = text.split(/\r?\n/);
  let buffer = "";
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (buffer === "" && (trimmed === "" || trimmed.startsWith("#"))) continue;
    if (buffer !== "" && trimmed.startsWith("#")) continue; // comments inside continuations
    if (buffer === "") start = i + 1;
    if (trimmed.endsWith("\\")) {
      buffer += trimmed.slice(0, -1) + " ";
      continue;
    }
    buffer += trimmed;
    const match = /^(\S+)\s*(.*)$/s.exec(buffer.trim());
    if (match) out.push({ keyword: match[1]!.toUpperCase(), args: match[2]!.replace(/\s+/g, " ").trim(), line: start });
    buffer = "";
  }
  return out;
}

export function splitStages(instructions: Instruction[]): Stage[] {
  const stages: Stage[] = [];
  for (const ins of instructions) {
    if (ins.keyword === "FROM") {
      const tokens = ins.args.split(" ").filter((t) => !t.startsWith("--"));
      const asIndex = tokens.findIndex((t) => t.toUpperCase() === "AS");
      stages.push({
        index: stages.length,
        base: tokens[0] ?? "",
        ...(asIndex >= 0 && tokens[asIndex + 1] ? { name: tokens[asIndex + 1]!.toLowerCase() } : {}),
        instructions: [ins],
      });
    } else if (stages.length > 0) {
      stages[stages.length - 1]!.instructions.push(ins);
    }
  }
  return stages;
}

/** Turns `["node", "dist/server.js"]` into ["node", "dist/server.js"], or undefined if not exec form. */
export function execForm(args: string): string[] | undefined {
  if (!args.trim().startsWith("[")) return undefined;
  try {
    const parsed: unknown = JSON.parse(args);
    return Array.isArray(parsed) && parsed.every((p) => typeof p === "string") ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Strips leading HEALTHCHECK options (--interval=10s ...) and the CMD keyword. */
export function healthcheckCommand(args: string): string | undefined {
  const rest = args.replace(/^(--\S+\s+)*/, "").trim();
  if (/^NONE$/i.test(rest)) return undefined;
  const m = /^CMD\s+(.*)$/is.exec(rest);
  return m ? m[1]!.trim() : undefined;
}
