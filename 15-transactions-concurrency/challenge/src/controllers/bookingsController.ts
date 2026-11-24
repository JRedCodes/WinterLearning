import type { RequestHandler } from "express";
import type { BookingService } from "../services/bookingService.js";
import { parseOrThrow } from "../lib/validation.js";
import { CreateBookingBody, IdParams, IdempotencyKeyHeader } from "./schemas.js";

export function bookingsController(service: BookingService) {
  const create: RequestHandler = async (req, res) => {
    const body = parseOrThrow(CreateBookingBody, req.body);
    const key = parseOrThrow(IdempotencyKeyHeader, req.get("idempotency-key"));
    const { booking, replayed } = await service.book(body, key);
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(201).location(`/bookings/${booking.id}`).json({ data: booking });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    res.json({ data: await service.get(id) });
  };

  return { create, get };
}
