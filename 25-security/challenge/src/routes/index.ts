import { Router } from "express";
import { fileController } from "../controllers/fileController.js";
import { userController } from "../controllers/userController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { FileService } from "../services/fileService.js";
import type { UserService } from "../services/userService.js";

export function apiRoutes(deps: { users: UserRepository; fileService: FileService; userService: UserService }): Router {
  const files = fileController(deps.fileService);
  const users = userController(deps.userService);
  const router = Router();

  router.use(authenticate(deps.users));

  router.get("/files", files.list);
  router.post("/files", files.upload);
  router.get("/files/download", files.download);
  router.post("/files/import", files.importFromUrl);

  router.get("/me", users.me);
  router.patch("/me", users.updateMe);
  router.get("/me/settings", users.getSettings);
  router.put("/me/settings", users.updateSettings);

  router.get("/admin/users", requireAdmin, users.listUsers);
  return router;
}
