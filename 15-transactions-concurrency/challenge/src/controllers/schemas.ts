import { z } from "zod";

const id = z.coerce.number().int().positive();
const cents = z.number().int().positive().max(100_000_000);

export const IdParams = z.object({ id });

export const CreateConcertBody = z.object({
  name: z.string().trim().min(1).max(200),
  capacity: z.number().int().positive().max(100_000),
  priceCents: z.number().int().min(0).max(1_000_000),
});

export const CreateWalletBody = z.object({
  owner: z.string().trim().min(1).max(200),
  initialBalanceCents: z.number().int().min(0).max(100_000_000).default(0),
});

export const DepositBody = z.object({ amountCents: cents });

export const TransferBody = z.object({
  fromWalletId: z.number().int().positive(),
  toWalletId: z.number().int().positive(),
  amountCents: cents,
});

export const CreateBookingBody = z.object({
  concertId: z.number().int().positive(),
  walletId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(10),
});

export const IdempotencyKeyHeader = z.string().trim().min(1).max(200).optional();
