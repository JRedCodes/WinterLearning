import type { RequestHandler, Response } from "express";
import type { Validated } from "../middleware/validate.js";
import type { NewProductInput, ProductPatch, ProductQuery, ProductService } from "../services/productService.js";
import { toProductDto } from "./dto.js";

/**
 * Controllers never look at req.body / req.query / req.params directly.
 * They read the values validate() already parsed. By the time a controller
 * runs, its input is typed and trustworthy.
 *
 * The casts below are the one place we tell TypeScript "validate() ran with
 * the matching schema" (routes/products.ts guarantees it). Module 08 shows
 * how to make that link type-safe.
 */
function input<T extends keyof Validated>(res: Response, part: T): unknown {
  const validated = res.locals.validated as Validated | undefined;
  return validated?.[part];
}

export function createProductController(products: ProductService) {
  const list: RequestHandler = async (_req, res) => {
    const query = input(res, "query") as ProductQuery;
    const { items, total } = await products.list(query);
    res.json({ data: items.map(toProductDto), page: { page: query.page, limit: query.limit, total } });
  };

  const get: RequestHandler = async (_req, res) => {
    const { id } = input(res, "params") as { id: string };
    res.json({ data: toProductDto(await products.get(id)) });
  };

  const create: RequestHandler = async (_req, res) => {
    const product = await products.create(input(res, "body") as NewProductInput);
    res.status(201).location(`/products/${product.id}`).json({ data: toProductDto(product) });
  };

  const update: RequestHandler = async (_req, res) => {
    const { id } = input(res, "params") as { id: string };
    const product = await products.update(id, input(res, "body") as ProductPatch);
    res.json({ data: toProductDto(product) });
  };

  const reserve: RequestHandler = async (_req, res) => {
    const { id } = input(res, "params") as { id: string };
    const { quantity } = input(res, "body") as { quantity: number };
    res.json({ data: toProductDto(await products.reserve(id, quantity)) });
  };

  const remove: RequestHandler = async (_req, res) => {
    const { id } = input(res, "params") as { id: string };
    await products.remove(id);
    res.status(204).end();
  };

  return { list, get, create, update, reserve, remove };
}
