// Tiny Markdown helpers for checking the write-ups. No dependencies on purpose:
// we only need headings, sections, bullets, code fences and word counts.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const CHALLENGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

export interface Section {
  /** Heading text without the leading #'s, trimmed. */
  title: string;
  level: number;
  /** Everything after the heading line up to the next heading of the same or higher level. */
  body: string;
}

/** Read a deliverable relative to challenge/. Returns null if it doesn't exist. */
export function readDoc(name: string): string | null {
  const path = join(CHALLENGE_DIR, name);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Remove HTML comments (the template guidance lives in them). */
export function stripComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, "");
}

/** Remove fenced code blocks (``` or ~~~). */
export function stripCode(md: string): string {
  return md.replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, "");
}

/** Split a document into sections at the given heading level, ignoring '#' lines inside code fences. */
export function sections(md: string, level: number): Section[] {
  const lines = md.split(/\r?\n/);
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

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Find a section whose title starts with `name` (case- and punctuation-insensitive). */
export function findSection(all: Section[], name: string): Section | undefined {
  const want = normalize(name);
  return all.find((s) => normalize(s.title).startsWith(want));
}

/** Count words of prose: comments, code blocks, and Markdown punctuation don't count. */
export function wordCount(md: string): number {
  const prose = stripCode(stripComments(md))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links: keep the text
    .replace(/[#>*_`|[\]-]/g, " ");
  return prose.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** Plain bullet items ("- x", "* x", "1. x"), excluding task-list checkboxes. Code blocks ignored. */
export function bullets(md: string): string[] {
  return stripCode(stripComments(md))
    .split(/\r?\n/)
    .map((l) => /^\s*(?:[-*+]|\d+\.)\s+(?!\[[ xX]\])(.+)$/.exec(l)?.[1]?.trim())
    .filter((b): b is string => Boolean(b));
}

/** Task-list items ("- [ ] x" / "- [x] x"). */
export function checkboxes(md: string): string[] {
  return stripComments(md)
    .split(/\r?\n/)
    .map((l) => /^\s*[-*+]\s+\[[ xX]\]\s+(.+)$/.exec(l)?.[1]?.trim())
    .filter((b): b is string => Boolean(b));
}

export function hasCodeBlock(md: string, lang?: string): boolean {
  const re = lang ? new RegExp("^(```|~~~)\\s*" + lang + "\\b", "m") : /^(```|~~~)/m;
  return re.test(stripComments(md));
}

/** Leftover template markers outside comments: TODO lines or <angle bracket placeholders>. */
export function leftovers(md: string): string[] {
  return stripCode(stripComments(md))
    .split(/\r?\n/)
    .filter((l) => /\bTODO\b/.test(l) || /<[A-Z][^<>]*>/.test(l))
    .map((l) => l.trim());
}
