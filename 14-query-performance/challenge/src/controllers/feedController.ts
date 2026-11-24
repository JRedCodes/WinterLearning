import type { RequestHandler } from "express";
import type { FeedService } from "../services/feedService.js";
import type { UserService } from "../services/userService.js";
import { FeedQuery, IdParams, LimitQuery, LookupQuery } from "./schemas.js";

export function createFeedController(feed: FeedService, users: UserService) {
  const getFeed: RequestHandler = async (req, res) => {
    const { limit, cursor } = FeedQuery.parse(req.query);
    res.json(await feed.getFeed(cursor === undefined ? { limit } : { limit, cursor }));
  };

  const getPost: RequestHandler = async (req, res) => {
    const { id } = IdParams.parse(req.params);
    res.json({ data: await feed.getPost(id) });
  };

  const lookupUser: RequestHandler = async (req, res) => {
    const { email } = LookupQuery.parse(req.query);
    res.json({ data: await users.lookupByEmail(email) });
  };

  const userPosts: RequestHandler = async (req, res) => {
    const { id } = IdParams.parse(req.params);
    const { limit } = LimitQuery.parse(req.query);
    res.json({ data: await users.timeline(id, limit) });
  };

  return { getFeed, getPost, lookupUser, userPosts };
}

export type FeedController = ReturnType<typeof createFeedController>;
