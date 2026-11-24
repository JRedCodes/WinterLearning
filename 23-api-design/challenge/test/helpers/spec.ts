import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import type request from "supertest";
import { expect } from "vitest";
import { parse } from "yaml";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const SPEC_PATH = new URL("../../openapi.yaml", import.meta.url);
const SPEC_ID = "openapi.json";
export const HTTP_METHODS = ["get", "put", "post", "patch", "delete", "head", "options"] as const;

let cached: Json | undefined;
/** The parsed openapi.yaml (throws a readable error if it doesn't parse). */
export function loadSpec(): Json {
  if (cached) return cached;
  const text = readFileSync(SPEC_PATH, "utf8");
  try {
    cached = parse(text);
  } catch (err) {
    throw new Error(`openapi.yaml is not valid YAML: ${(err as Error).message}`);
  }
  return cached;
}

const unescape = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");
export const escapePointer = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

/** Value at a JSON pointer like "#/components/schemas/Task" (undefined if missing). */
export function at(pointer: string): Json {
  const parts = pointer.replace(/^#\/?/, "").split("/").filter((p) => p !== "").map(unescape);
  let node: Json = loadSpec();
  for (const p of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[p];
  }
  return node;
}

/** Follows $ref chains. Returns the final node and its pointer. */
export function deref(node: Json, pointer: string): { node: Json; pointer: string } {
  const seen = new Set<string>();
  while (node && typeof node === "object" && typeof node.$ref === "string") {
    const ref: string = node.$ref;
    if (!ref.startsWith("#/")) throw new Error(`Only local $refs are supported, got "${ref}" at ${pointer}`);
    if (seen.has(ref)) throw new Error(`Circular $ref at ${pointer}`);
    seen.add(ref);
    pointer = ref;
    node = at(ref);
    if (node === undefined) throw new Error(`Unresolvable $ref "${ref}"`);
  }
  return { node, pointer };
}

export interface FoundOperation {
  path: string;
  method: string;
  op: Json;
  pointer: string;
  /** Path-level + operation-level parameters, $refs resolved. */
  parameters: Json[];
}

export function operations(): FoundOperation[] {
  const spec = loadSpec();
  const out: FoundOperation[] = [];
  for (const [path, item] of Object.entries<Json>(spec?.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const pointer = `#/paths/${escapePointer(path)}/${method}`;
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(
        (p: Json, i: number) => deref(p, `${pointer}/parameters/${i}`).node,
      );
      out.push({ path, method, op, pointer, parameters: params });
    }
  }
  return out;
}

export function findOperation(operationId: string): FoundOperation {
  const found = operations().find((o) => o.op.operationId === operationId);
  if (!found) throw new Error(`openapi.yaml has no operation with operationId "${operationId}"`);
  return found;
}

let ajv: Ajv2020 | undefined;
function getAjv(): Ajv2020 {
  if (ajv) return ajv;
  ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
  (addFormatsImport as unknown as (a: Ajv2020) => void)(ajv);
  ajv.addSchema(loadSpec(), SPEC_ID);
  return ajv;
}

/** Validates `value` against the schema at `pointer` (e.g. "#/components/schemas/Task"). */
export function expectMatchesSchema(value: unknown, pointer: string): void {
  const validate = getAjv().getSchema(`${SPEC_ID}${pointer}`);
  if (!validate) throw new Error(`No schema at ${pointer}`);
  const ok = validate(value);
  const errors = (validate.errors ?? []).map((e) => `  ${e.instancePath || "(root)"} ${e.message}`).join("\n");
  expect(ok, `response does not match ${pointer}:\n${errors}\nbody: ${JSON.stringify(value)}`).toBe(true);
}

/**
 * The core conformance check: the response's status must be documented for the
 * operation, its media type must be one the spec lists, and its body must
 * validate against the documented schema.
 */
export function expectConforms(res: request.Response, operationId: string): void {
  const { op, pointer } = findOperation(operationId);
  const status = String(res.status);
  const raw = op.responses?.[status];
  expect(raw, `${operationId}: status ${status} is not documented in openapi.yaml (body: ${res.text.slice(0, 300)})`).toBeDefined();
  const { node: response, pointer: responsePointer } = deref(raw, `${pointer}/responses/${status}`);

  const content = response.content as Record<string, Json> | undefined;
  if (!content || Object.keys(content).length === 0) {
    expect(res.text ?? "", `${operationId} ${status} is documented without a body, but one was sent`).toBe("");
    return;
  }
  const mediaType = String(res.headers["content-type"] ?? "").split(";")[0]!.trim();
  expect(Object.keys(content), `${operationId} ${status}: Content-Type "${mediaType}" is not documented`).toContain(mediaType);
  expectMatchesSchema(res.body, `${responsePointer}/content/${escapePointer(mediaType)}/schema`);
}
