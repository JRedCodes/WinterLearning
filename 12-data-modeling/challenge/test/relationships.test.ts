import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  PG,
  addMember,
  count,
  createBooking,
  createOrg,
  createRoom,
  createUser,
  expectRejected,
  freshDatabase,
  truncateAll,
  type Id,
} from "./helpers/db.js";

let client: pg.Client;

beforeAll(async () => {
  client = await freshDatabase();
});
afterAll(async () => {
  await client?.end();
});
beforeEach(async () => {
  await truncateAll(client);
});

/** org → room → booking (organized by `organizer`, attended by `attendee`) */
async function world() {
  const orgId = await createOrg(client);
  const organizer = await createUser(client);
  const attendee = await createUser(client);
  await addMember(client, orgId, organizer, "admin");
  await addMember(client, orgId, attendee);
  const roomId = await createRoom(client, orgId);
  const bookingId = await createBooking(client, roomId, organizer, "2026-12-01 09:00Z", "2026-12-01 10:00Z");
  await client.query("INSERT INTO booking_attendees (booking_id, user_id) VALUES ($1, $2), ($1, $3)", [
    bookingId,
    organizer,
    attendee,
  ]);
  return { orgId, organizer, attendee, roomId, bookingId };
}

describe("foreign keys and ON DELETE behaviour", () => {
  it("bookings must reference an existing room and organizer", async () => {
    const { roomId, organizer } = await world();
    await client.query("DELETE FROM booking_attendees");
    const missing = /^\d+$/.test(roomId) ? "999999" : "00000000-0000-0000-0000-000000000000";
    await expectRejected(
      client,
      "booking for a missing room",
      "INSERT INTO bookings (room_id, organizer_id, title, starts_at, ends_at) VALUES ($1, $2, 'X', '2026-12-02 09:00Z', '2026-12-02 10:00Z')",
      [missing, organizer],
      PG.FOREIGN_KEY,
    );
    await expectRejected(
      client,
      "booking by a missing user",
      "INSERT INTO bookings (room_id, organizer_id, title, starts_at, ends_at) VALUES ($1, $2, 'X', '2026-12-02 09:00Z', '2026-12-02 10:00Z')",
      [roomId, missing],
      PG.FOREIGN_KEY,
    );
  });

  it("deleting an organization cascades to its memberships, rooms, bookings and attendees (users stay)", async () => {
    const { orgId } = await world();
    await client.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    expect(await count(client, "memberships"), "memberships").toBe(0);
    expect(await count(client, "rooms"), "rooms").toBe(0);
    expect(await count(client, "bookings"), "bookings").toBe(0);
    expect(await count(client, "booking_attendees"), "booking_attendees").toBe(0);
    expect(await count(client, "users"), "users must NOT be deleted with an organization").toBe(2);
  });

  it("deleting a booking removes its attendee rows", async () => {
    const { bookingId } = await world();
    await client.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    expect(await count(client, "booking_attendees")).toBe(0);
  });

  it("a user who organizes bookings cannot be deleted (history must not vanish)", async () => {
    const { organizer } = await world();
    await expectRejected(client, "delete an organizer", "DELETE FROM users WHERE id = $1", [organizer], PG.FOREIGN_KEY);
  });

  it("deleting a user who only attends removes their memberships and attendance", async () => {
    const { attendee } = await world();
    await client.query("DELETE FROM users WHERE id = $1", [attendee]);
    expect(await count(client, "memberships", "user_id = $1", [attendee])).toBe(0);
    expect(await count(client, "booking_attendees", "user_id = $1", [attendee])).toBe(0);
    expect(await count(client, "bookings"), "the booking itself stays").toBe(1);
  });
});

describe("audit columns", () => {
  async function stamps(table: string, id: Id) {
    const { rows } = await client.query(`SELECT created_at, updated_at FROM ${table} WHERE id = $1`, [id]);
    return rows[0] as { created_at: Date; updated_at: Date };
  }

  it("users.updated_at moves forward on UPDATE; created_at doesn't", async () => {
    const userId = await createUser(client);
    const before = await stamps("users", userId);
    await new Promise((r) => setTimeout(r, 20));
    await client.query("UPDATE users SET full_name = 'Renamed' WHERE id = $1", [userId]);
    const after = await stamps("users", userId);
    expect(after.created_at.getTime()).toBe(before.created_at.getTime());
    expect(after.updated_at.getTime(), "add a BEFORE UPDATE trigger that sets updated_at = now()").toBeGreaterThan(
      before.updated_at.getTime(),
    );
  });

  it("bookings.updated_at moves forward on UPDATE", async () => {
    const { bookingId } = await world();
    const before = await stamps("bookings", bookingId);
    await new Promise((r) => setTimeout(r, 20));
    await client.query("UPDATE bookings SET title = 'Renamed' WHERE id = $1", [bookingId]);
    const after = await stamps("bookings", bookingId);
    expect(after.updated_at.getTime(), "add a BEFORE UPDATE trigger on bookings too").toBeGreaterThan(
      before.updated_at.getTime(),
    );
  });
});
