import { randomUUID } from "node:crypto";
import type { NewProject, Project } from "../domain/project.js";
import type { KeysetPosition } from "./taskRepository.js";

export interface ProjectRepository {
  create(input: NewProject, now: Date): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  /** Oldest first, strictly after `after` (keyset), at most `limit` items. */
  list(opts: { limit: number; after?: KeysetPosition }): Promise<Project[]>;
}

/** In-memory stand-in for a SQL table. Same contract a Postgres version would have. */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly rows = new Map<string, Project>();

  async create(input: NewProject, now: Date): Promise<Project> {
    const project: Project = { id: randomUUID(), ...input, createdAt: now.toISOString() };
    this.rows.set(project.id, project);
    return { ...project };
  }

  async findById(id: string): Promise<Project | null> {
    const p = this.rows.get(id);
    return p ? { ...p } : null;
  }

  async list({ limit, after }: { limit: number; after?: KeysetPosition }): Promise<Project[]> {
    return [...this.rows.values()]
      .sort(compareAsc)
      .filter((p) => !after || compareAsc(p, after) > 0)
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }
}

/** ORDER BY created_at, id */
function compareAsc(a: KeysetPosition, b: KeysetPosition): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
