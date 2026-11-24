import { describe, expect, it } from "vitest";
import { at, deref, escapePointer, findOperation, loadSpec, operations } from "./helpers/spec.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** operationId -> [method, path, statuses that must be documented] */
const REQUIRED: Record<string, [string, string, number[]]> = {
  listProjects: ["get", "/v1/projects", [200, 400]],
  createProject: ["post", "/v1/projects", [201, 400]],
  getProject: ["get", "/v1/projects/{projectId}", [200, 404]],
  listProjectTasks: ["get", "/v1/projects/{projectId}/tasks", [200, 400, 404]],
  createTask: ["post", "/v1/projects/{projectId}/tasks", [201, 400, 404, 409, 422]],
  getTask: ["get", "/v1/tasks/{taskId}", [200, 304, 404]],
  updateTask: ["patch", "/v1/tasks/{taskId}", [200, 400, 404, 412, 428]],
  deleteTask: ["delete", "/v1/tasks/{taskId}", [204, 404]],
};

const SCHEMAS = ["Project", "NewProject", "ProjectList", "Task", "NewTask", "TaskPatch", "TaskList", "PageInfo", "Problem"];

const schema = (name: string) => deref(at(`#/components/schemas/${name}`), name).node;
const prop = (schemaName: string, p: string) => deref(schema(schemaName)?.properties?.[p], `${schemaName}.${p}`).node;
const header = (operationId: string, status: number, name: string) => {
  const { op, pointer } = findOperation(operationId);
  const res = deref(op.responses?.[String(status)], pointer).node;
  const entry = Object.entries<any>(res?.headers ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return entry ? deref(entry[1], `${operationId}.${status}.${name}`).node : undefined;
};
const param = (operationId: string, location: string, name: string) =>
  findOperation(operationId).parameters.find((p: any) => p?.in === location && p?.name?.toLowerCase() === name.toLowerCase());

describe("TODO(1) · openapi.yaml: document", () => {
  it("is OpenAPI 3.1 with info.title and info.version", () => {
    const spec = loadSpec();
    expect(String(spec?.openapi)).toMatch(/^3\.1\./);
    expect(spec?.info?.title).toEqual(expect.any(String));
    expect(spec?.info?.version).toEqual(expect.any(String));
  });

  it("every $ref resolves", () => {
    const broken: string[] = [];
    const walk = (node: any, path: string) => {
      if (!node || typeof node !== "object") return;
      if (typeof node.$ref === "string" && at(node.$ref) === undefined) broken.push(`${path} -> ${node.$ref}`);
      for (const [k, v] of Object.entries(node)) walk(v, `${path}/${escapePointer(k)}`);
    };
    walk(loadSpec(), "#");
    expect(broken, `unresolvable $refs:\n${broken.join("\n")}`).toEqual([]);
  });

  it("every operation has a unique operationId and a summary", () => {
    const ops = operations();
    const ids = ops.map((o) => o.op.operationId);
    expect(new Set(ids).size, `duplicate operationIds: ${ids}`).toBe(ids.length);
    for (const o of ops) {
      expect(o.op.operationId, `${o.method.toUpperCase()} ${o.path} needs an operationId`).toEqual(expect.any(String));
      expect(o.op.summary, `${o.op.operationId} needs a summary`).toEqual(expect.any(String));
    }
  });

  it("declares every path template parameter as a required path parameter", () => {
    for (const o of operations()) {
      for (const [, name] of o.path.matchAll(/\{(\w+)\}/g)) {
        const p = o.parameters.find((x: any) => x?.in === "path" && x?.name === name);
        expect(p, `${o.op.operationId}: path parameter "${name}" not declared`).toBeDefined();
        expect(p.required, `${o.op.operationId}: path parameter "${name}" must be required: true`).toBe(true);
      }
    }
  });
});

describe("TODO(1) · openapi.yaml: operations", () => {
  it.each(Object.entries(REQUIRED))("%s exists with its responses", (operationId, [method, path, statuses]) => {
    const found = findOperation(operationId);
    expect(`${found.method} ${found.path}`).toBe(`${method} ${path}`);
    const documented = Object.keys(found.op.responses ?? {});
    for (const s of statuses) expect(documented, `${operationId} must document ${s}`).toContain(String(s));
  });

  it("every 4xx/5xx response is application/problem+json with the shared Problem schema via $ref", () => {
    let checked = 0;
    for (const o of operations()) {
      for (const [status, raw] of Object.entries<any>(o.op.responses ?? {})) {
        if (!/^[45]/.test(status)) continue;
        const { node } = deref(raw, `${o.pointer}/responses/${status}`);
        const media = node?.content?.["application/problem+json"];
        expect(media, `${o.op.operationId} ${status} must use application/problem+json`).toBeDefined();
        expect(media.schema?.$ref, `${o.op.operationId} ${status} must $ref the shared Problem schema`).toBe(
          "#/components/schemas/Problem",
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it("create operations return a Location header with 201", () => {
    expect(header("createProject", 201, "Location"), "createProject 201 Location").toBeDefined();
    expect(header("createTask", 201, "Location"), "createTask 201 Location").toBeDefined();
  });

  it("task representations carry an ETag header", () => {
    expect(header("getTask", 200, "ETag"), "getTask 200 ETag").toBeDefined();
    expect(header("updateTask", 200, "ETag"), "updateTask 200 ETag").toBeDefined();
    expect(header("createTask", 201, "ETag"), "createTask 201 ETag").toBeDefined();
  });

  it("createTask accepts an optional Idempotency-Key header", () => {
    const p = param("createTask", "header", "Idempotency-Key");
    expect(p, "Idempotency-Key header parameter").toBeDefined();
    expect(p.required ?? false).toBe(false);
  });

  it("updateTask requires an If-Match header", () => {
    const p = param("updateTask", "header", "If-Match");
    expect(p, "If-Match header parameter").toBeDefined();
    expect(p.required).toBe(true);
  });

  it("list operations document limit (max 100) and cursor; tasks also status and sort", () => {
    for (const id of ["listProjects", "listProjectTasks"]) {
      const limit = param(id, "query", "limit");
      expect(limit, `${id} limit`).toBeDefined();
      expect(deref(limit.schema, id).node?.maximum, `${id} limit maximum`).toBe(100);
      expect(param(id, "query", "cursor"), `${id} cursor`).toBeDefined();
    }
    expect(param("listProjectTasks", "query", "status")).toBeDefined();
    const sort = param("listProjectTasks", "query", "sort");
    expect(sort).toBeDefined();
    expect([...(deref(sort.schema, "sort").node?.enum ?? [])].sort()).toEqual(["-createdAt", "createdAt"]);
  });
});

describe("TODO(1) · openapi.yaml: schemas", () => {
  it.each(SCHEMAS)("components.schemas.%s exists", (name) => {
    expect(schema(name), `missing components.schemas.${name}`).toBeDefined();
  });

  it("Task requires every field and rejects unknown ones", () => {
    const task = schema("Task");
    expect([...(task?.required ?? [])].sort()).toEqual(
      ["createdAt", "dueDate", "id", "priority", "projectId", "status", "title", "updatedAt", "version"].sort(),
    );
    expect(task?.additionalProperties).toBe(false);
    expect(prop("Task", "status")?.enum).toEqual(["todo", "in_progress", "done"]);
    expect(prop("Task", "priority")?.enum).toEqual(["low", "medium", "high"]);
    expect(prop("Task", "version")?.type).toBe("integer");
    expect(prop("Task", "dueDate")?.type, "dueDate is nullable: type: [string, \"null\"]").toEqual(["string", "null"]);
  });

  it("NewTask requires only title; TaskPatch requires nothing but at least one property", () => {
    expect(schema("NewTask")?.required).toEqual(["title"]);
    expect(schema("NewTask")?.additionalProperties).toBe(false);
    expect(schema("TaskPatch")?.required ?? []).toEqual([]);
    expect(schema("TaskPatch")?.minProperties).toBe(1);
  });

  it("list schemas use the { data, page: { limit, nextCursor } } envelope", () => {
    for (const name of ["ProjectList", "TaskList"]) {
      expect([...(schema(name)?.required ?? [])].sort(), name).toEqual(["data", "page"]);
      expect(schema(name)?.properties?.data?.type, `${name}.data`).toBe("array");
    }
    expect([...(schema("PageInfo")?.required ?? [])].sort()).toEqual(["limit", "nextCursor"]);
    expect(prop("PageInfo", "nextCursor")?.type).toEqual(["string", "null"]);
  });

  it("Problem follows RFC 9457", () => {
    const problem = schema("Problem");
    expect(problem?.required).toEqual(expect.arrayContaining(["type", "title", "status"]));
    for (const p of ["type", "title", "status", "detail", "instance"]) {
      expect(problem?.properties?.[p], `Problem.${p}`).toBeDefined();
    }
    expect(prop("Problem", "status")?.type).toBe("integer");
    expect(prop("Problem", "errors")?.type, "Problem.errors extension (array of {pointer, detail})").toBe("array");
  });
});
