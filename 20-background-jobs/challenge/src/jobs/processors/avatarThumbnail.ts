import type { Thumbnailer } from "../../domain/ports.js";
import type { UserRepository } from "../../repositories/userRepository.js";
import type { AvatarThumbnailData } from "../types.js";

export interface AvatarThumbnailDeps {
  users: UserRepository;
  thumbnailer: Thumbnailer;
}

export interface AvatarThumbnailResult {
  thumbnailUrl: string;
}

/**
 * TODO(6): Retry what might succeed next time, and nothing else.
 *
 * This processor works, but every failure is a plain Error, so a user who
 * typed "not a url" as their avatar costs us 5 attempts with backoff before
 * the job finally fails, and the thumbnailer gets called with garbage.
 *
 * - imageUrl that isn't a valid http:// or https:// URL → UnrecoverableError
 *   BEFORE calling the thumbnailer (hint: `new URL()` throws on garbage).
 * - user not found → UnrecoverableError.
 * - errors from the thumbnailer itself stay as they are (transient: retry).
 */
export function createAvatarThumbnailProcessor(deps: AvatarThumbnailDeps) {
  return async (job: {
    data: AvatarThumbnailData;
    updateProgress?: (progress: number) => Promise<void>;
  }): Promise<AvatarThumbnailResult> => {
    const { userId, imageUrl } = job.data;
    const user = await deps.users.findById(userId);
    if (!user) throw new Error(`user ${userId} not found`);

    await job.updateProgress?.(10);
    const thumbnailUrl = await deps.thumbnailer.createThumbnail(imageUrl);
    await deps.users.setAvatarThumbnail(userId, thumbnailUrl);
    await job.updateProgress?.(100);
    return { thumbnailUrl };
  };
}
