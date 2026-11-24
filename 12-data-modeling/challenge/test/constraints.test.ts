import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import type pg from "pg";
import {
  PG,
  addMember,
  createBooking,
  createOrg,
  createRoom,
  createUser,
  expectAccepted,
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

describe("organizations", () => {
  it("requires a name and a slug", async () => {
    await expectRejected(client, "missing name", "INSERT INTO organizations (slug) VALUES ('acme')", [], PG.NOT_NULL);
    await expectRejected(client, "missing slug", "INSERT INTO organizations (name) VALUES ('Acme')", [], PG.NOT_NULL);
  });

  it("slugs are unique", async () => {
    await createOrg(client, "acme");
    await expectRejected(
      client,
      "duplicate slug",
      "INSERT INTO organizations (name, slug) VALUES ('Acme 2', 'acme')",
      [],
      PG.UNIQUE,
    );
  });

  it.each(["Acme", "acme corp", "-acme", "acme-", "ac--me", ""])("rejects the badly formatted slug %j", async (slug) => {
    await expectRejected(
      client,
      `slug ${JSON.stringify(slug)}`,
      "INSERT INTO organizations (name, slug) VALUES ('X', $1)",
      [slug],
      PG.CHECK,
    );
  });

  it("accepts well-formed slugs", async () => {
    await expectAccepted(client, "slug acme-corp-2", "INSERT INTO organizations (name, slug) VALUES ('X', 'acme-corp-2')");
  });
});

describe("users", () => {
  it("emails are unique case-insensitively", async () => {
    await createUser(client, "Dana@Example.com");
    await expectRejected(
      client,
      "same email, different case",
      "INSERT INTO users (email, full_name) VALUES ('dana@example.COM', 'Dana Again')",
      [],
      PG.UNIQUE,
    );
  });

  it("rejects an email without an @", async () => {
    await expectRejected(
      client,
      "email 'not-an-email'",
      "INSERT INTO users (email, full_name) VALUES ('not-an-email', 'X')",
      [],
      PG.CHECK,
    );
  });

  it("requires full_name", async () => {
    await expectRejected(client, "missing full_name", "INSERT INTO users (email) VALUES ('a@b.co')", [], PG.NOT_NULL);
  });
});

describe("memberships", () => {
  let orgId: Id;
  let userId: Id;
  beforeEach(async () => {
    orgId = await createOrg(client);
    userId = await createUser(client);
  });

  it.each(["owner", "admin", "member"])("accepts the role %s", async (role) => {
    await addMember(client, orgId, userId, role);
  });

  it("rejects unknown roles", async () => {
    await expectRejected(
      client,
      "role 'superadmin'",
      "INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'superadmin')",
      [orgId, userId],
      [PG.CHECK, PG.INVALID_TEXT],
    );
  });

  it("a user is a member of an organization at most once", async () => {
    await addMember(client, orgId, userId);
    await expectRejected(
      client,
      "duplicate membership",
      "INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'admin')",
      [orgId, userId],
      PG.UNIQUE,
    );
  });

  it("must reference an existing organization and user", async () => {
    await expectRejected(
      client,
      "membership in a missing organization",
      "INSERT INTO memberships (organization_id, user_id) VALUES ($1, $2)",
      [/^\d+$/.test(orgId) ? "999999" : "00000000-0000-0000-0000-000000000000", userId],
      PG.FOREIGN_KEY,
    );
  });
});

describe("rooms", () => {
  let orgId: Id;
  beforeEach(async () => {
    orgId = await createOrg(client);
  });

  it.each([0, -3])("rejects capacity %i", async (capacity) => {
    await expectRejected(
      client,
      `capacity ${capacity}`,
      "INSERT INTO rooms (organization_id, name, capacity) VALUES ($1, 'Tiny', $2)",
      [orgId, capacity],
      PG.CHECK,
    );
  });

  it("room names are unique within an organization", async () => {
    await createRoom(client, orgId, "Fjord");
    await expectRejected(
      client,
      "second live room called Fjord",
      "INSERT INTO rooms (organization_id, name, capacity) VALUES ($1, 'Fjord', 4)",
      [orgId],
      PG.UNIQUE,
    );
  });

  it("the same room name is fine in another organization", async () => {
    await createRoom(client, orgId, "Fjord");
    const other = await createOrg(client);
    await expectAccepted(
      client,
      "Fjord in another org",
      "INSERT INTO rooms (organization_id, name, capacity) VALUES ($1, 'Fjord', 4)",
      [other],
    );
  });

  it("a soft-deleted room frees its name", async () => {
    const roomId = await createRoom(client, orgId, "Fjord");
    await client.query("UPDATE rooms SET deleted_at = now() WHERE id = $1", [roomId]);
    await expectAccepted(
      client,
      "new Fjord after the old one was soft-deleted",
      "INSERT INTO rooms (organization_id, name, capacity) VALUES ($1, 'Fjord', 4)",
      [orgId],
    );
  });

  it("features must be a JSON object", async () => {
    await expectRejected(
      client,
      "features = JSON array",
      "INSERT INTO rooms (organization_id, name, capacity, features) VALUES ($1, 'Arr', 4, '[\"tv\"]')",
      [orgId],
      PG.CHECK,
    );
    await expectAccepted(
      client,
      "features = JSON object",
      `INSERT INTO rooms (organization_id, name, capacity, features) VALUES ($1, 'Obj', 4, '{"tv": true}')`,
      [orgId],
    );
  });
});

describe("bookings", () => {
  let roomId: Id;
  let otherRoomId: Id;
  let userId: Id;
  const insert =
    "INSERT INTO bookings (room_id, organizer_id, title, starts_at, ends_at) VALUES ($1, $2, 'Planning', $3, $4)";

  beforeEach(async () => {
    const orgId = await createOrg(client);
    roomId = await createRoom(client, orgId, "Fjord");
    otherRoomId = await createRoom(client, orgId, "Glacier");
    userId = await createUser(client);
  });

  it("must end after it starts", async () => {
    await expectRejected(
      client,
      "ends before it starts",
      insert,
      [roomId, userId, "2026-12-01 10:00Z", "2026-12-01 09:00Z"],
      PG.CHECK,
    );
    await expectRejected(
      client,
      "zero-length booking",
      insert,
      [roomId, userId, "2026-12-01 10:00Z", "2026-12-01 10:00Z"],
      PG.CHECK,
    );
  });

  it("rejects an unknown status", async () => {
    await expectRejected(
      client,
      "status 'maybe'",
      "INSERT INTO bookings (room_id, organizer_id, title, starts_at, ends_at, status) VALUES ($1, $2, 'X', '2026-12-01 09:00Z', '2026-12-01 10:00Z', 'maybe')",
      [roomId, userId],
      [PG.CHECK, PG.INVALID_TEXT],
    );
  });

  it("rejects overlapping confirmed bookings of the same room", async () => {
    await createBooking(client, roomId, userId, "2026-12-01 09:00Z", "2026-12-01 10:00Z");
    await expectRejected(
      client,
      "09:30–10:30 overlaps 09:00–10:00",
      insert,
      [roomId, userId, "2026-12-01 09:30Z", "2026-12-01 10:30Z"],
      PG.EXCLUSION,
    );
    await expectRejected(
      client,
      "08:00–12:00 contains 09:00–10:00",
      insert,
      [roomId, userId, "2026-12-01 08:00Z", "2026-12-01 12:00Z"],
      PG.EXCLUSION,
    );
  });

  it("allows back-to-back bookings (end == next start)", async () => {
    await createBooking(client, roomId, userId, "2026-12-01 09:00Z", "2026-12-01 10:00Z");
    await expectAccepted(client, "10:00–11:00 right after 09:00–10:00", insert, [
      roomId,
      userId,
      "2026-12-01 10:00Z",
      "2026-12-01 11:00Z",
    ]);
  });

  it("allows the same time slot in a different room", async () => {
    await createBooking(client, roomId, userId, "2026-12-01 09:00Z", "2026-12-01 10:00Z");
    await expectAccepted(client, "same slot, other room", insert, [
      otherRoomId,
      userId,
      "2026-12-01 09:00Z",
      "2026-12-01 10:00Z",
    ]);
  });

  it("cancelled bookings don't block the slot", async () => {
    await createBooking(client, roomId, userId, "2026-12-01 09:00Z", "2026-12-01 10:00Z", "cancelled");
    await expectAccepted(client, "slot of a cancelled booking", insert, [
      roomId,
      userId,
      "2026-12-01 09:00Z",
      "2026-12-01 10:00Z",
    ]);
  });

  it("cannot un-cancel a booking into a slot that is now taken", async () => {
    const cancelled = await createBooking(client, roomId, userId, "2026-12-01 09:00Z", "2026-12-01 10:00Z", "cancelled");
    await createBooking(client, roomId, userId, "2026-12-01 09:30Z", "2026-12-01 10:30Z");
    await expectRejected(
      client,
      "re-confirming an overlapping booking",
      "UPDATE bookings SET status = 'confirmed' WHERE id = $1",
      [cancelled],
      PG.EXCLUSION,
    );
  });
});

describe("booking attendees", () => {
  it("each user attends a booking at most once, with a valid response", async () => {
    const orgId = await createOrg(client);
    const userId = await createUser(client);
    const bookingId = await createBooking(
      client,
      await createRoom(client, orgId),
      userId,
      "2026-12-01 09:00Z",
      "2026-12-01 10:00Z",
    );
    await client.query("INSERT INTO booking_attendees (booking_id, user_id, response) VALUES ($1, $2, 'accepted')", [
      bookingId,
      userId,
    ]);
    await expectRejected(
      client,
      "same attendee twice",
      "INSERT INTO booking_attendees (booking_id, user_id) VALUES ($1, $2)",
      [bookingId, userId],
      PG.UNIQUE,
    );
    const other = await createUser(client);
    await expectRejected(
      client,
      "response 'perhaps'",
      "INSERT INTO booking_attendees (booking_id, user_id, response) VALUES ($1, $2, 'perhaps')",
      [bookingId, other],
      [PG.CHECK, PG.INVALID_TEXT],
    );
  });
});
