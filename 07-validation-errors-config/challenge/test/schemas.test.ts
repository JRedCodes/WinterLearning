/** TODO(2): zod schemas, tested directly with no HTTP involved. */
import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  makeListProductsQuerySchema,
  productParamsSchema,
  reserveSchema,
  updateProductSchema,
} from "../src/schemas/product.js";

const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  (result.error?.issues ?? []).map((i) => i.path.join("."));

describe("createProductSchema (TODO 2)", () => {
  const valid = { sku: " tshirt-red-m ", name: "  Red T-shirt ", category: " Apparel ", priceCents: 1999 };

  it("normalizes strings and applies defaults", () => {
    expect(createProductSchema.parse(valid)).toEqual({
      sku: "TSHIRT-RED-M",
      name: "Red T-shirt",
      category: "apparel",
      priceCents: 1999,
      stock: 0,
      tags: [],
    });
  });

  it("strips unknown keys instead of passing them through (mass assignment)", () => {
    const parsed = createProductSchema.parse({ ...valid, id: "prd_hacked", createdAt: "1999-01-01" });
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("createdAt");
  });

  it("trims tags and rejects empty ones", () => {
    expect(createProductSchema.parse({ ...valid, tags: [" summer ", "sale"] }).tags).toEqual(["summer", "sale"]);
    expect(paths(createProductSchema.safeParse({ ...valid, tags: ["ok", "  "] }))).toEqual(["tags.1"]);
  });

  it.each([
    ["sku too short", { sku: "ab" }, "sku"],
    ["sku with spaces", { sku: "RED SHIRT" }, "sku"],
    ["empty name", { name: "   " }, "name"],
    ["name over 120 chars", { name: "n".repeat(121) }, "name"],
    ["price as a string", { priceCents: "1999" }, "priceCents"],
    ["fractional price", { priceCents: 19.99 }, "priceCents"],
    ["negative price", { priceCents: -1 }, "priceCents"],
    ["negative stock", { stock: -5 }, "stock"],
    ["too many tags", { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, "tags"],
  ])("rejects %s", (_label, patch, path) => {
    expect(paths(createProductSchema.safeParse({ ...valid, ...patch }))).toContain(path);
  });

  it("reports every problem, not just the first", () => {
    const result = createProductSchema.safeParse({ sku: "x", priceCents: -1 });
    expect(paths(result).sort()).toEqual(["category", "name", "priceCents", "sku"]);
  });
});

describe("updateProductSchema (TODO 2)", () => {
  it("accepts a partial update and strips sku/stock", () => {
    const parsed = updateProductSchema.parse({ priceCents: 2500, sku: "NEW-SKU", stock: 99 });
    expect(parsed).toEqual({ priceCents: 2500 });
  });

  it("rejects an empty update with a single whole-object issue", () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.message).toBe("provide at least one field to update");
  });

  it("applies the same field rules as create", () => {
    expect(paths(updateProductSchema.safeParse({ name: "" }))).toContain("name");
  });
});

describe("productParamsSchema and reserveSchema (TODO 2)", () => {
  it("validates product ids", () => {
    expect(productParamsSchema.parse({ id: "prd_ab12" })).toEqual({ id: "prd_ab12" });
    expect(productParamsSchema.safeParse({ id: "../etc/passwd" }).success).toBe(false);
  });

  it.each([0, 1001, 1.5, "3"])("rejects quantity %s", (quantity) => {
    expect(reserveSchema.safeParse({ quantity }).success).toBe(false);
  });

  it("accepts a valid quantity", () => {
    expect(reserveSchema.parse({ quantity: 3 })).toEqual({ quantity: 3 });
  });
});

describe("makeListProductsQuerySchema (TODO 2)", () => {
  const schema = makeListProductsQuerySchema({ defaultLimit: 20, maxLimit: 100 });

  it("uses defaults from its options", () => {
    expect(schema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(makeListProductsQuerySchema({ defaultLimit: 5, maxLimit: 10 }).parse({}).limit).toBe(5);
  });

  it("coerces query-string values", () => {
    expect(
      schema.parse({ page: "2", limit: "50", category: " Apparel ", minPriceCents: "100", maxPriceCents: "500", inStock: "true" }),
    ).toEqual({ page: 2, limit: 50, category: "apparel", minPriceCents: 100, maxPriceCents: 500, inStock: true });
  });

  it('parses inStock="false" as false (the z.coerce.boolean trap)', () => {
    expect(schema.parse({ inStock: "false" }).inStock).toBe(false);
  });

  it.each([
    ["page=0", { page: "0" }, "page"],
    ["page=abc", { page: "abc" }, "page"],
    ["limit above max", { limit: "101" }, "limit"],
    ["fractional limit", { limit: "2.5" }, "limit"],
    ["repeated limit (?limit=1&limit=2)", { limit: ["1", "2"] }, "limit"],
    ["inStock=maybe", { inStock: "maybe" }, "inStock"],
  ])("rejects %s", (_label, query, path) => {
    expect(paths(schema.safeParse(query))).toContain(path);
  });

  it("rejects minPriceCents > maxPriceCents on the minPriceCents path", () => {
    expect(paths(schema.safeParse({ minPriceCents: "500", maxPriceCents: "100" }))).toEqual(["minPriceCents"]);
  });
});
