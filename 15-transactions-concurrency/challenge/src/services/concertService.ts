import type pg from "pg";
import type { Concert } from "../domain/types.js";
import { NotFoundError } from "../domain/errors.js";
import type { ConcertRepository } from "../repositories/concertRepository.js";

export interface ConcertServiceDeps {
  pool: pg.Pool;
  concerts: ConcertRepository;
}

export class ConcertService {
  constructor(private readonly deps: ConcertServiceDeps) {}

  create(input: { name: string; capacity: number; priceCents: number }): Promise<Concert> {
    return this.deps.concerts.create(this.deps.pool, input);
  }

  async get(id: number): Promise<Concert> {
    const concert = await this.deps.concerts.findById(this.deps.pool, id);
    if (!concert) throw new NotFoundError("Concert", id);
    return concert;
  }
}
