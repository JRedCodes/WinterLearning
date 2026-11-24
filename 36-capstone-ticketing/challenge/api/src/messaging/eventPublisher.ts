/**
 * The port between the booking core and the event stream (Kafka in production).
 *
 * The core never imports kafkajs. It writes events to an outbox table inside its
 * own transactions; an OutboxRelay later hands them to an EventPublisher. Tests
 * use an in-memory publisher; worker.ts wires a Kafka-backed one.
 */

/** Envelope shared by every event on the stream. */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  /** Unique per event (uuid). Consumers use it to de-duplicate redeliveries. */
  id: string;
  type: TType;
  /** Schema version of `payload` for this `type`. Bump it on breaking changes. */
  version: number;
  /**
   * Partitioning key. Events with the same key keep their relative order in Kafka.
   * For booking events this is the event (show) id.
   */
  key: string;
  /** ISO-8601 timestamp taken from the injected Clock. */
  occurredAt: string;
  payload: TPayload;
}

export interface BookingConfirmedPayload {
  bookingId: string;
  eventId: string;
  eventName: string;
  userId: string;
  userEmail: string;
  /** Seat labels, sorted, e.g. ["A1", "A2"]. */
  seats: string[];
  totalCents: number;
}

export type BookingConfirmedEvent = DomainEvent<"booking.confirmed", BookingConfirmedPayload>;

export interface EventPublisher {
  /**
   * Publishes the events in order. Resolves only when the broker acknowledged
   * all of them; rejects if any could not be published.
   */
  publish(events: readonly DomainEvent[]): Promise<void>;
}
