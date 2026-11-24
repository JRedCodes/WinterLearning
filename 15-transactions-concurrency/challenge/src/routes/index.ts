import { Router } from "express";
import type { Services } from "../container.js";
import { concertsController } from "../controllers/concertsController.js";
import { walletsController } from "../controllers/walletsController.js";
import { bookingsController } from "../controllers/bookingsController.js";

export function apiRouter(services: Services): Router {
  const router = Router();
  const concerts = concertsController(services.concerts);
  const wallets = walletsController(services.wallets);
  const bookings = bookingsController(services.bookings);

  router.post("/concerts", concerts.create);
  router.get("/concerts/:id", concerts.get);

  router.post("/wallets", wallets.create);
  router.get("/wallets/:id", wallets.get);
  router.post("/wallets/:id/deposits", wallets.deposit);
  router.post("/transfers", wallets.transfer);

  router.post("/bookings", bookings.create);
  router.get("/bookings/:id", bookings.get);

  return router;
}
