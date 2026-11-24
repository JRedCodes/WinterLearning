import type pg from "pg";
import type { NewParcel, Parcel, ParcelStatus } from "../domain/parcel.js";

export interface ParcelRepository {
  create(input: NewParcel & { trackingCode: string }): Promise<Parcel>;
  findById(id: string): Promise<Parcel | undefined>;
  list(filter: { status?: ParcelStatus; limit: number }): Promise<Parcel[]>;
  updateStatus(id: string, status: ParcelStatus): Promise<Parcel | undefined>;
}

interface ParcelRow {
  id: string;
  tracking_code: string;
  recipient: string;
  destination: string;
  status: ParcelStatus;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = "id, tracking_code, recipient, destination, status, created_at, updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toParcel(row: ParcelRow): Parcel {
  return {
    id: row.id,
    trackingCode: row.tracking_code,
    recipient: row.recipient,
    destination: row.destination,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PgParcelRepository implements ParcelRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: NewParcel & { trackingCode: string }): Promise<Parcel> {
    const { rows } = await this.pool.query<ParcelRow>(
      `INSERT INTO parcels (tracking_code, recipient, destination) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [input.trackingCode, input.recipient, input.destination],
    );
    return toParcel(rows[0]!);
  }

  async findById(id: string): Promise<Parcel | undefined> {
    if (!UUID.test(id)) return undefined; // not a uuid -> cannot exist (and avoids a 22P02 error)
    const { rows } = await this.pool.query<ParcelRow>(`SELECT ${COLUMNS} FROM parcels WHERE id = $1`, [id]);
    return rows[0] ? toParcel(rows[0]) : undefined;
  }

  async list(filter: { status?: ParcelStatus; limit: number }): Promise<Parcel[]> {
    const { rows } = await this.pool.query<ParcelRow>(
      `SELECT ${COLUMNS} FROM parcels
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at, id
       LIMIT $2`,
      [filter.status ?? null, filter.limit],
    );
    return rows.map(toParcel);
  }

  async updateStatus(id: string, status: ParcelStatus): Promise<Parcel | undefined> {
    if (!UUID.test(id)) return undefined;
    const { rows } = await this.pool.query<ParcelRow>(
      `UPDATE parcels SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, status],
    );
    return rows[0] ? toParcel(rows[0]) : undefined;
  }
}
