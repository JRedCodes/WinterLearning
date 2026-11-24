import type { RequestHandler } from "express";
import type { WalletService } from "../services/walletService.js";
import { parseOrThrow } from "../lib/validation.js";
import { CreateWalletBody, DepositBody, IdParams, TransferBody } from "./schemas.js";

export function walletsController(service: WalletService) {
  const create: RequestHandler = async (req, res) => {
    const body = parseOrThrow(CreateWalletBody, req.body);
    const wallet = await service.create(body);
    res.status(201).location(`/wallets/${wallet.id}`).json({ data: wallet });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    res.json({ data: await service.get(id) });
  };

  const deposit: RequestHandler = async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    const { amountCents } = parseOrThrow(DepositBody, req.body);
    res.json({ data: await service.deposit(id, amountCents) });
  };

  const transfer: RequestHandler = async (req, res) => {
    const body = parseOrThrow(TransferBody, req.body);
    res.status(201).json({ data: await service.transfer(body) });
  };

  return { create, get, deposit, transfer };
}
