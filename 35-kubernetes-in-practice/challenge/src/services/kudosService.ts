import { InvalidKudosError, KudosNotFoundError, type Kudos, type NewKudos } from "../domain/kudos.js";
import type { KudosRepository } from "../repositories/kudosRepository.js";

const LIMITS = { name: 60, message: 280 } as const;

/** Business rules live here: no Express, no SQL. */
export class KudosService {
  constructor(private readonly repo: KudosRepository) {}

  async give(input: NewKudos): Promise<Kudos> {
    const kudos = {
      from: input.from.trim(),
      to: input.to.trim(),
      message: input.message.trim(),
    };
    const problems: { path: string; message: string }[] = [];
    if (!kudos.from || kudos.from.length > LIMITS.name) problems.push({ path: "from", message: `1–${LIMITS.name} characters` });
    if (!kudos.to || kudos.to.length > LIMITS.name) problems.push({ path: "to", message: `1–${LIMITS.name} characters` });
    if (!kudos.message || kudos.message.length > LIMITS.message)
      problems.push({ path: "message", message: `1–${LIMITS.message} characters` });
    if (kudos.from && kudos.from.toLowerCase() === kudos.to.toLowerCase())
      problems.push({ path: "to", message: "you can't give kudos to yourself" });
    if (problems.length) throw new InvalidKudosError(problems);
    return this.repo.create(kudos);
  }

  async get(id: string): Promise<Kudos> {
    const kudos = await this.repo.findById(id);
    if (!kudos) throw new KudosNotFoundError(id);
    return kudos;
  }

  async recent(limit: number): Promise<Kudos[]> {
    return this.repo.listRecent(limit);
  }
}
