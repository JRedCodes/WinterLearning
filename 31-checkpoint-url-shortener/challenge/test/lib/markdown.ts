// Tiny Markdown helpers for checking design write-ups. No dependencies on purpose:
// we only need headings, sections, list items, tables, code fences and word counts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CHALLENGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

export interface Section {
  /** Heading text without the leading #'s, trimmed. */
  title: string;
  level: number;
  /** Everything after the heading line up to the next heading of the same or higher level. */
  body: string;
}

/** Read a file relative to challenge/. Returns null if it doesn't exist. */
export function readDoc(name: string): string | null {
  const path = join(CHALLENGE_DIR, name);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Remove HTML comments (the template guidance lives in them). */
export function stripComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, "");
}

/** Remove fenced code blocks (``` or ~~~), including mermaid diagrams. */
export function stripCode(md: string): string {
  return md.replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, "");
}

/** Split a document into sections at the given heading level, ignoring '#' lines inside code fences. */
export function sections(md: string, level: number): Section[] {
  const lines = stripComments(md).split(/\r?\n/);
  const out: Section[] = [];
  let current: Section | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    const m = inFence ? null : /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m && m[1] && m[2] !== undefined) {
      const lvl = m[1].length;
      if (lvl <= level) {
        if (current) out.push(current);
        current = lvl === level ? { title: m[2].trim(), level: lvl, body: "" } : null;
        continue;
      }
    }
    if (current) current.body += line + "\n";
  }
  if (current) out.push(current);
  return out;
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Find a section whose title starts with `name` (case- and punctuation-insensitive). */
export function findSection(all: Section[], name: string): Section | undefined {
  const want = normalize(name);
  return all.find((s) => normalize(s.title).startsWith(want));
}

/** Count words of prose: comments, code blocks and Markdown punctuation don't count. */
export function wordCount(md: string): number {
  const prose = stripCode(stripComments(md))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|[\]-]/g, " ");
  return prose.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** List items ("- x", "* x", "1. x"). Code blocks and comments ignored. */
export function listItems(md: string): string[] {
  return stripCode(stripComments(md))
    .split(/\r?\n/)
    .map((l) => /^\s*(?:[-*+]|\d+\.)\s+(.+)$/.exec(l)?.[1]?.trim())
    .filter((b): b is string => Boolean(b));
}

/** Table body rows (header row and |---| separator rows excluded). */
export function tableRows(md: string): string[] {
  const lines = stripCode(stripComments(md)).split(/\r?\n/);
  const rows: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?$/.test(line)) continue; // separator
    const next = lines[i + 1]?.trim() ?? "";
    if (/^\|[\s:|-]+\|?$/.test(next)) continue; // this is a header row
    rows.push(line);
  }
  return rows;
}

/** "Items" in a section: list items, table rows and ### subsections, whichever the author used. */
export function itemCount(md: string): number {
  return listItems(md).length + tableRows(md).length + sections(md, 3).length;
}

export function hasCodeBlock(md: string, lang?: string): boolean {
  const re = lang ? new RegExp("^(```|~~~)\\s*" + lang + "\\b", "m") : /^(```|~~~)/m;
  return re.test(stripComments(md));
}

/**
 * Numbers that look like estimates: 10, 1.5, 300k, 2M, 40 GB. Code blocks count (estimates are often
 * written as arithmetic in a code block); mermaid diagrams and comments don't.
 */
export function numericTokens(md: string): string[] {
  return stripComments(md)
    .replace(/^(```|~~~)\s*mermaid[\s\S]*?^\1[ \t]*$/gm, "")
    .match(/\b\d+(?:[.,]\d+)?(?:\s?(?:k|K|M|B|G|T|%|x)\b)?/g) ?? [];
}

/** Leftover template markers outside comments and code: TODO or <Angle Placeholders>. */
export function leftovers(md: string): string[] {
  return stripCode(stripComments(md))
    .split(/\r?\n/)
    .filter((l) => /\bTODO\b/.test(l) || /<[A-Z][^<>]*>/.test(l))
    .map((l) => l.trim());
}
