import type { RequestHandler } from "express";
import type { ConcertService } from "../services/concertService.js";
import { parseOrThrow } from "../lib/validation.js";
import { CreateConcertBody, IdParams } from "./schemas.js";

export function concertsController(service: ConcertService) {
  const create: RequestHandler = async (req, res) => {
    const body = parseOrThrow(CreateConcertBody, req.body);
    const concert = await service.create(body);
    res.status(201).location(`/concerts/${concert.id}`).json({ data: concert });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    res.json({ data: await service.get(id) });
  };

  return { create, get };
}
