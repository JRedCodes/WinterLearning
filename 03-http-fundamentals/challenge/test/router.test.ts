import { describe, expect, it } from "vitest";
import { Router } from "../src/router.js";
import type { RouteHandler } from "../src/types.js";

const h = (name: string): RouteHandler => Object.assign(() => {}, { routeName: name });

function build() {
  const list = h("list");
  const create = h("create");
  const show = h("show");
  const remove = h("remove");
  const router = new Router()
    .add("GET", "/bookmarks", list)
    .add("POST", "/bookmarks", create)
    .add("GET", "/bookmarks/:id", show)
    .add("DELETE", "/bookmarks/:id", remove);
  return { router, list, create, show, remove };
}

describe("Router (TODO 1)", () => {
  it("matches method + exact path", () => {
    const { router, list, create } = build();
    expect(router.match("GET", "/bookmarks")).toEqual({ kind: "found", handler: list, params: {} });
    expect(router.match("POST", "/bookmarks")).toEqual({ kind: "found", handler: create, params: {} });
  });

  it("captures :params", () => {
    const { router, show } = build();
    expect(router.match("GET", "/bookmarks/abc-123")).toEqual({ kind: "found", handler: show, params: { id: "abc-123" } });
  });

  it("URL-decodes params", () => {
    const { router } = build();
    const match = router.match("GET", "/bookmarks/hello%20world");
    expect(match.kind).toBe("found");
    if (match.kind === "found") expect(match.params.id).toBe("hello world");
  });

  it("treats malformed percent-encoding as not found instead of throwing", () => {
    const { router } = build();
    expect(router.match("GET", "/bookmarks/%E0%A4%A")).toEqual({ kind: "not-found" });
  });

  it("returns not-found for unknown paths, extra segments, empty params and trailing slashes", () => {
    const { router } = build();
    for (const path of ["/nope", "/bookmarks/1/extra", "/bookmarks/", "/", "/bookmarksx"]) {
      expect(router.match("GET", path), `GET ${path}`).toEqual({ kind: "not-found" });
    }
  });

  it("answers HEAD with the GET handler", () => {
    const { router, show } = build();
    expect(router.match("HEAD", "/bookmarks/7")).toEqual({ kind: "found", handler: show, params: { id: "7" } });
  });

  it("returns method-not-allowed with the sorted list of allowed methods (GET implies HEAD)", () => {
    const { router } = build();
    expect(router.match("PATCH", "/bookmarks")).toEqual({ kind: "method-not-allowed", allowed: ["GET", "HEAD", "POST"] });
    expect(router.match("PUT", "/bookmarks/1")).toEqual({
      kind: "method-not-allowed",
      allowed: ["DELETE", "GET", "HEAD"],
    });
  });

  it("is case-insensitive about the method name", () => {
    const { router, list } = build();
    expect(router.match("get", "/bookmarks")).toEqual({ kind: "found", handler: list, params: {} });
  });

  it("first registered route wins when two patterns match", () => {
    const special = h("special");
    const generic = h("generic");
    const router = new Router().add("GET", "/bookmarks/export", special).add("GET", "/bookmarks/:id", generic);
    expect(router.match("GET", "/bookmarks/export")).toMatchObject({ kind: "found", handler: special });
    expect(router.match("GET", "/bookmarks/42")).toMatchObject({ kind: "found", handler: generic });
  });
});
