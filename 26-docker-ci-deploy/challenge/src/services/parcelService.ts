import { randomBytes } from "node:crypto";
import {
  InvalidTransitionError,
  ParcelNotFoundError,
  canTransition,
  type NewParcel,
  type Parcel,
  type ParcelStatus,
} from "../domain/parcel.js";
import type { ParcelRepository } from "../repositories/parcelRepository.js";

/** Business rules and orchestration. Knows nothing about HTTP or SQL. */
export class ParcelService {
  constructor(
    private readonly repo: ParcelRepository,
    private readonly newTrackingCode: () => string = () => "WL" + randomBytes(5).toString("hex").toUpperCase(),
  ) {}

  register(input: NewParcel): Promise<Parcel> {
    return this.repo.create({ ...input, trackingCode: this.newTrackingCode() });
  }

  async get(id: string): Promise<Parcel> {
    const parcel = await this.repo.findById(id);
    if (!parcel) throw new ParcelNotFoundError(id);
    return parcel;
  }

  list(filter: { status?: ParcelStatus; limit: number }): Promise<Parcel[]> {
    return this.repo.list(filter);
  }

  async moveTo(id: string, next: ParcelStatus): Promise<Parcel> {
    const current = await this.get(id);
    if (!canTransition(current.status, next)) throw new InvalidTransitionError(current.status, next);
    const updated = await this.repo.updateStatus(id, next);
    if (!updated) throw new ParcelNotFoundError(id);
    return updated;
  }
}
