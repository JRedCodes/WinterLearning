import { Router } from "express";
import { parcelController } from "../controllers/parcelController.js";
import type { ParcelService } from "../services/parcelService.js";

export function parcelsRouter(service: ParcelService): Router {
  const c = parcelController(service);
  const router = Router();
  router.get("/", c.list);
  router.post("/", c.create);
  router.get("/:id", c.get);
  router.post("/:id/status", c.updateStatus);
  return router;
}
