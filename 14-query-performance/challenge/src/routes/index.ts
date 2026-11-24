import { Router } from "express";
import type { FeedController } from "../controllers/feedController.js";

export function createRoutes(c: FeedController): Router {
  const router = Router();
  router.get("/feed", c.getFeed);
  router.get("/posts/:id", c.getPost);
  router.get("/users/lookup", c.lookupUser); // before /users/:id/...
  router.get("/users/:id/posts", c.userPosts);
  return router;
}
