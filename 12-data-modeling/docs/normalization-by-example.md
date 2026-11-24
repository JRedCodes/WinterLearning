# Normalization by example

This walks one messy table all the way to 3NF, one problem at a time. The goal isn't to memorize the normal forms. It's to recognize the *smell* of redundancy and know which way to split.

## The starting point

An operations team kept room bookings in a spreadsheet, and someone imported it straight into Postgres:

```
bookings_import
booking | org   | org_plan | room   | room_cap | organizer        | attendees                     | starts           | ends
--------+-------+----------+--------+----------+------------------+-------------------------------+------------------+------
1       | Acme  | pro      | Fjord  | 8        | dana@acme.io     | dana@acme.io; li@acme.io      | 2026-12-01 09:00 | 10:00
2       | Acme  | pro      | Fjord  | 8        | li@acme.io       | li@acme.io                    | 2026-12-01 10:00 | 11:00
3       | Acme  | pro      | Glacier| 4        | dana@acme.io     | dana@acme.io; omar@acme.io    | 2026-12-01 09:00 | 09:30
4       | Globex| free     | Fjord  | 6        | dana@acme.io     | dana@acme.io                  | 2026-12-02 14:00 | 15:00
```

Things are already going wrong:

- "Fjord" has capacity 8 in some rows and 6 in another. Is that a mistake, or does Globex have its own Fjord? The table can't tell you.
- To find every booking Li attends, you need `attendees LIKE '%li@acme.io%'`, which also matches `kali@acme.io`.
- If Acme upgrades its plan, you must update every Acme booking. Miss one and Acme is both "pro" and "free".
- There's no way to record a new room until someone books it.

## Step 1 — 1NF: atomic values

`attendees` holds a list. Lists inside cells can't be indexed, constrained or joined. Give the repeating group its own table, one row per (booking, attendee):

```
bookings(booking, org, org_plan, room, room_cap, organizer, starts, ends)
booking_attendees(booking, attendee_email)     -- PK (booking, attendee_email)
```

Also suspicious: `ends` holds only a time, so the date is implied by `starts`. Store complete values (`timestamptz` for both).

## Step 2 — 2NF: depend on the whole key

2NF only bites when a table has a composite key. Suppose `booking_attendees` had grown an `attendee_name` column. Its key is `(booking, attendee_email)`, but the name depends only on `attendee_email`, so it repeats for every booking that person attends. Pull people into their own table:

```
users(id, email, full_name)
booking_attendees(booking_id, user_id)
```

Now a name change is one `UPDATE`.

## Step 3 — 3NF: nothing but the key

Look at `bookings` again. Its key is `booking`. Which columns describe something *other than* the booking?

- `room_cap` describes the room. → `rooms(id, org_id, name, capacity)`
- `org_plan` describes the organization. → `organizations(id, name, plan)`
- `org` is implied by the room (a room belongs to one org), so storing it on the booking is a second path to the same fact. Drop it from bookings. You can always join through the room.

These are **transitive dependencies**: booking → room → capacity. 3NF says to remove them.

## The result

```
organizations(id, name, plan)
users(id, email, full_name)
memberships(organization_id, user_id, role)
rooms(id, organization_id, name, capacity)
bookings(id, room_id, organizer_id, starts_at, ends_at)
booking_attendees(booking_id, user_id)
```

Every question from the start now has a clean answer:

| Question | Before | After |
|---|---|---|
| Capacity of Acme's Fjord? | depends on which row you read | `rooms` has one row for it |
| Bookings Li attends? | string matching | join on `booking_attendees.user_id` |
| Acme upgrades its plan | update N booking rows | update 1 organization row |
| A new room nobody booked yet | impossible | `INSERT INTO rooms` |

## Is there a 4NF, 5NF, BCNF?

Yes. Boyce–Codd normal form tightens 3NF for some overlapping-key cases, and 4NF/5NF deal with independent multi-valued facts. In everyday application schemas, if you reach 3NF by asking "what does this column *really* describe?", you'll almost always be in BCNF too. You won't be asked to prove it in a job interview. You will be asked to spot a list in a column or a duplicated fact.

## When to stop normalizing

- **Snapshots:** an invoice must keep the address and prices *as they were*. Copying them isn't redundancy, it's a different fact.
- **Hot aggregates:** a `bookings_count` on rooms for a dashboard, kept in sync deliberately.
- **Lookup granularity:** splitting `city` into a `cities` table with an FK is technically "more normal", but rarely worth it unless cities carry data of their own.

Normalize until each fact has one home. Then denormalize on purpose, with a plan for keeping the copy correct.
