/**
 * A deliberately small .gitignore evaluator, good enough for the patterns this challenge needs:
 * comments, blank lines, `!negation`, a leading `/` (anchored), a trailing `/` (directories only),
 * `*`, `?` and `**`. Later lines win, like in git.
 *
 * It's here so the tests can ask "would git ignore this path?" without needing a git repo.
 */
interface Rule {
  negate: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

function globToRegex(glob: string): string {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return out;
}

export function parseGitignore(content: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of content.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.startsWith("/") || line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    const body = globToRegex(line);
    // Unanchored patterns match at any depth; anchored ones only from the root.
    const prefix = anchored ? "^" : "^(?:.*/)?";
    rules.push({ negate, dirOnly, regex: new RegExp(`${prefix}${body}$`) });
  }
  return rules;
}

/**
 * Would `filePath` be ignored? Pass directories with a trailing slash ("dist/").
 * A file is also ignored when any of its parent directories is.
 */
export function isIgnored(rules: Rule[], filePath: string): boolean {
  const isDir = filePath.endsWith("/");
  const clean = isDir ? filePath.slice(0, -1) : filePath;
  const parts = clean.split("/");
  // Check each parent directory first: once a directory is ignored, git never looks inside.
  for (let i = 1; i < parts.length; i++) {
    if (matches(rules, parts.slice(0, i).join("/"), true)) return true;
  }
  return matches(rules, clean, isDir);
}

function matches(rules: Rule[], p: string, isDir: boolean): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(p)) ignored = !rule.negate;
  }
  return ignored;
}
