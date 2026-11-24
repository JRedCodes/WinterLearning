import type { Request, Response } from "express";
import { z } from "zod";
import { PARCEL_STATUSES } from "../domain/parcel.js";
import { HttpError } from "../lib/httpError.js";
import type { ParcelService } from "../services/parcelService.js";

const NewParcelBody = z.object({
  recipient: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200),
});
const StatusBody = z.object({ status: z.enum(PARCEL_STATUSES) });
const ListQuery = z.object({
  status: z.enum(PARCEL_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new HttpError(
    400,
    "VALIDATION_ERROR",
    "Request is invalid",
    result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

/** Thin HTTP adapter: parse input -> call the service -> shape the response. */
export function parcelController(service: ParcelService) {
  return {
    async create(req: Request, res: Response) {
      const parcel = await service.register(parse(NewParcelBody, req.body));
      res.status(201).location(`/parcels/${parcel.id}`).json({ data: parcel });
    },
    async get(req: Request, res: Response) {
      res.json({ data: await service.get(String(req.params.id)) });
    },
    async list(req: Request, res: Response) {
      res.json({ data: await service.list(parse(ListQuery, req.query)) });
    },
    async updateStatus(req: Request, res: Response) {
      const { status } = parse(StatusBody, req.body);
      res.json({ data: await service.moveTo(String(req.params.id), status) });
    },
  };
}
