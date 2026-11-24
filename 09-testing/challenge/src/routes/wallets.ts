import { Router } from "express";
import { walletsController } from "../controllers/walletsController.js";
import type { WalletService } from "../services/walletService.js";

export function walletRoutes(wallets: WalletService): Router {
  const c = walletsController(wallets);
  const router = Router();

  router.post("/wallets", c.create);
  router.get("/wallets/:id", c.get);
  router.post("/wallets/:id/deposits", c.deposit);
  router.post("/wallets/:id/withdrawals", c.withdraw);
  router.get("/wallets/:id/transactions", c.transactions);
  router.post("/transfers", c.transfer);

  return router;
}
