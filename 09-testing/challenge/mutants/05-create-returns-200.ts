// @mutant-of: src/controllers/walletsController.ts
// @mutant: POST /wallets answers 200 without a Location header
import type { Request, Response } from "express";
import { z } from "zod";
import { parse } from "../lib/validate.js";
import type { WalletService } from "../services/walletService.js";

const amount = z.number().int().positive().max(10_000_000);

const createWalletBody = z.object({ owner: z.string().trim().min(1).max(100) });
const amountBody = z.object({ amountCents: amount });
const transferBody = z.object({
  fromWalletId: z.string().min(1),
  toWalletId: z.string().min(1),
  amountCents: amount,
});
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

type WithId = Request<{ id: string }>;

export function walletsController(wallets: WalletService) {
  return {
    async create(req: Request, res: Response) {
      const { owner } = parse(createWalletBody, req.body);
      const wallet = await wallets.createWallet(owner);
      res.json({ data: wallet });
    },

    async get(req: WithId, res: Response) {
      res.json({ data: await wallets.getWallet(req.params.id) });
    },

    async deposit(req: WithId, res: Response) {
      const { amountCents } = parse(amountBody, req.body);
      res.json({ data: await wallets.deposit(req.params.id, amountCents) });
    },

    async withdraw(req: WithId, res: Response) {
      const { amountCents } = parse(amountBody, req.body);
      res.json({ data: await wallets.withdraw(req.params.id, amountCents) });
    },

    async transactions(req: WithId, res: Response) {
      const { limit } = parse(listQuery, req.query);
      res.json({ data: await wallets.listTransactions(req.params.id, limit) });
    },

    async transfer(req: Request, res: Response) {
      const body = parse(transferBody, req.body);
      res.json({ data: await wallets.transfer(body.fromWalletId, body.toWalletId, body.amountCents) });
    },
  };
}
