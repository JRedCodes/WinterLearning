/**
 * Domain: no Express, no SQL. Just the rules about parcels.
 */
export const PARCEL_STATUSES = ["registered", "in_transit", "out_for_delivery", "delivered", "returned"] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

export interface Parcel {
  id: string;
  trackingCode: string;
  recipient: string;
  destination: string;
  status: ParcelStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewParcel {
  recipient: string;
  destination: string;
}

/** Which status may follow which. `delivered` and `returned` are terminal. */
const TRANSITIONS: Record<ParcelStatus, readonly ParcelStatus[]> = {
  registered: ["in_transit", "returned"],
  in_transit: ["out_for_delivery", "returned"],
  out_for_delivery: ["delivered", "in_transit", "returned"],
  delivered: [],
  returned: [],
};

export function canTransition(from: ParcelStatus, to: ParcelStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class ParcelNotFoundError extends Error {
  constructor(public readonly parcelId: string) {
    super(`Parcel ${parcelId} not found`);
    this.name = "ParcelNotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ParcelStatus,
    public readonly to: ParcelStatus,
  ) {
    super(`Cannot move a parcel from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}
