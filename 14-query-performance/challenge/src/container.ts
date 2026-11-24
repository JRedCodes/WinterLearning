import type { Queryable } from "./db/pool.js";
import { CommentRepository } from "./repositories/commentRepository.js";
import { PostRepository } from "./repositories/postRepository.js";
import { UserRepository } from "./repositories/userRepository.js";
import { FeedService } from "./services/feedService.js";
import { UserService } from "./services/userService.js";

export interface Services {
  feedService: FeedService;
  userService: UserService;
}

/**
 * Wires repositories and services around ONE Queryable. server.ts passes the
 * pool (or a logging QueryRecorder); tests pass a QueryRecorder so they can
 * count and EXPLAIN every query a request makes.
 */
export function buildServices(db: Queryable): Services {
  const users = new UserRepository(db);
  const posts = new PostRepository(db);
  const comments = new CommentRepository(db);
  return {
    feedService: new FeedService(posts, users, comments),
    userService: new UserService(users, posts),
  };
}
