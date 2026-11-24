import type { Kudos, NewKudos } from "../domain/kudos.js";

/** What the service needs from storage. Postgres in the cluster, in-memory in tests. */
export interface KudosRepository {
  create(input: NewKudos): Promise<Kudos>;
  findById(id: string): Promise<Kudos | undefined>;
  listRecent(limit: number): Promise<Kudos[]>;
}

export class InMemoryKudosRepository implements KudosRepository {
  private readonly rows: Kudos[] = [];
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(input: NewKudos): Promise<Kudos> {
    const kudos: Kudos = { id: String(this.nextId++), ...input, createdAt: this.now().toISOString() };
    this.rows.push(kudos);
    return kudos;
  }

  async findById(id: string): Promise<Kudos | undefined> {
    return this.rows.find((k) => k.id === id);
  }

  async listRecent(limit: number): Promise<Kudos[]> {
    return [...this.rows].reverse().slice(0, limit);
  }
}
