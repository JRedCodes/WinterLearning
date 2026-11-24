import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient } from "../src/api/client";
import { ApiError } from "../src/api/errors";
import { json, problem } from "./helpers/fakeApi";

function stubFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => impl(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Runs the promise and returns the ApiError it rejects with (fails the test otherwise). */
async function apiErrorFrom(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => expect.fail("expected the request to fail"),
    (e: unknown) => e,
  );
  expect(error, `expected an ApiError, got: ${String(error)}`).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const client = () => createApiClient({ baseUrl: "http://api.test/" });

describe("createApiClient (TODO 1)", () => {
  describe("building requests", () => {
    it("joins baseUrl and path, adds query params and skips undefined/null ones", async () => {
      const fetchMock = stubFetch(() => json(200, { ok: true }));
      await client().request("/v1/things", { query: { limit: 5, cursor: undefined, status: null, q: "a b" } });
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe("http://api.test/v1/things?limit=5&q=a+b");
      expect(init?.method ?? "GET").toBe("GET");
    });

    it("sends JSON bodies with Content-Type, Accept and custom headers", async () => {
      const fetchMock = stubFetch(() => json(201, { id: "1" }));
      await client().request("/v1/things", { method: "POST", body: { title: "x" }, headers: { "Idempotency-Key": "k1" } });
      const init = fetchMock.mock.calls[0]![1]!;
      const headers = new Headers(init.headers);
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ title: "x" }));
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("idempotency-key")).toBe("k1");
    });

    it("does not send a body or Content-Type when there is no body", async () => {
      const fetchMock = stubFetch(() => json(200, []));
      await client().request("/v1/things");
      const init = fetchMock.mock.calls[0]![1]!;
      expect(init.body).toBeUndefined();
      expect(new Headers(init.headers).has("content-type")).toBe(false);
    });

    it("passes the AbortSignal through to fetch", async () => {
      const fetchMock = stubFetch(() => json(200, {}));
      const controller = new AbortController();
      await client().request("/x", { signal: controller.signal });
      expect(fetchMock.mock.calls[0]![1]!.signal).toBe(controller.signal);
    });
  });

  describe("successful responses", () => {
    it("returns the parsed JSON validated by the schema", async () => {
      stubFetch(() => json(200, { id: "1", extra: "dropped by zod" }));
      const result = await client().request("/x", { schema: z.object({ id: z.string() }) });
      expect(result).toEqual({ id: "1" });
    });

    it("returns undefined for 204 No Content", async () => {
      stubFetch(() => new Response(null, { status: 204 }));
      await expect(client().request("/x", { method: "DELETE" })).resolves.toBeUndefined();
    });

    it("throws ApiError(invalid_response) when the body doesn't match the schema", async () => {
      stubFetch(() => json(200, { id: 42 }));
      const error = await apiErrorFrom(client().request("/x", { schema: z.object({ id: z.string() }) }));
      expect(error.kind).toBe("invalid_response");
      expect(error.message).toBe("Unexpected response from server");
    });

    it("throws ApiError(invalid_response) when a 2xx body isn't JSON", async () => {
      stubFetch(() => new Response("<html>proxy page</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
      expect((await apiErrorFrom(client().request("/x"))).kind).toBe("invalid_response");
    });
  });

  describe("error mapping", () => {
    it("maps a problem+json error to ApiError(http) with status, detail and the problem", async () => {
      stubFetch(() => problem(404, "Not Found", "Task not found"));
      const error = await apiErrorFrom(client().request("/v1/tasks/nope"));
      expect(error).toMatchObject({ kind: "http", status: 404, message: "Task not found" });
      expect(error.problem?.title).toBe("Not Found");
    });

    it("maps problem `errors` pointers to fieldErrors", async () => {
      stubFetch(() =>
        problem(400, "Validation Failed", "Request validation failed", [
          { pointer: "/title", detail: "Title is required" },
          { pointer: "/dueDate", detail: "Invalid date" },
        ]),
      );
      const error = await apiErrorFrom(client().request("/x", { method: "POST", body: {} }));
      expect(error.fieldErrors).toEqual({ title: "Title is required", dueDate: "Invalid date" });
      expect(error.status).toBe(400);
    });

    it("falls back to the title when a problem has no detail", async () => {
      stubFetch(() => json(503, { title: "Service Unavailable", status: 503 }, "application/problem+json"));
      expect((await apiErrorFrom(client().request("/x"))).message).toBe("Service Unavailable");
    });

    it("uses a generic message for non-JSON error bodies", async () => {
      stubFetch(() => new Response("Bad Gateway", { status: 502, headers: { "Content-Type": "text/plain" } }));
      const error = await apiErrorFrom(client().request("/x"));
      expect(error).toMatchObject({ kind: "http", status: 502, message: "Request failed with status 502" });
      expect(error.fieldErrors).toEqual({});
    });

    it("maps a fetch failure (offline, DNS, CORS) to ApiError(network)", async () => {
      stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
      const error = await apiErrorFrom(client().request("/x"));
      expect(error.kind).toBe("network");
      expect(error.status).toBeUndefined();
      expect(error.message).toBe("Network error: could not reach the server");
    });

    it("lets AbortError through untouched (cancellation is not a failure)", async () => {
      const abort = new DOMException("The operation was aborted.", "AbortError");
      stubFetch(() => Promise.reject(abort));
      await expect(client().request("/x")).rejects.toBe(abort);
    });
  });
});
