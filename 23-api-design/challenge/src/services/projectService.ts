import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { Page } from "../domain/page.js";
import type { NewProject, Project } from "../domain/project.js";
import type { Clock } from "../lib/clock.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import type { ProjectRepository } from "../repositories/projectRepository.js";

/**
 * Worked example: read this before TODO(4). It shows the keyset pagination
 * pattern you'll reuse for tasks.
 */
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
  ) {}

  async create(input: NewProject): Promise<Project> {
    return this.projects.create(input, this.clock());
  }

  async get(id: string): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundError("Project");
    return project;
  }

  async list(query: { limit: number; cursor?: string }): Promise<Page<Project>> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;
    if (after && after.sort !== "createdAt") {
      throw new ValidationError("Invalid cursor", [{ pointer: "/cursor", detail: "Cursor belongs to a different sort" }]);
    }

    // Ask for one extra row: if it exists, there is a next page. No COUNT(*) needed.
    const rows = await this.projects.list({ limit: query.limit + 1, after });
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    const last = data.at(-1);

    return {
      data,
      page: {
        limit: query.limit,
        nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id, sort: "createdAt" }) : null,
      },
    };
  }
}
