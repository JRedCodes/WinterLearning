# Dates and time in backend code

Time bugs are some of the most common, embarrassing and hard-to-reproduce bugs in backend systems: they often only appear on certain days, in certain time zones or around daylight-saving changes. This page collects what you need for this checkpoint and beyond.

## Instants vs calendar values

| Kind | Example | Meaning | Store as |
|---|---|---|---|
| **Instant** | `2026-03-10T09:00:00.000Z` | one point on the global timeline | ISO string with `Z` / `timestamptz` |
| **Calendar date** | `2026-03-10` | a whole day; its start depends on a time zone | `YYYY-MM-DD` string / `date` |
| **Wall-clock time** | `07:30` | a time on a clock in some zone | `HH:mm` + a zone |
| **Duration** | 30 minutes | an amount of time | milliseconds / ISO 8601 duration |

Most confusion comes from mixing the first two. "The user checked in on 10 March" is a calendar date. "The request arrived at 09:00 UTC" is an instant. Converting an instant to a calendar date requires choosing a time zone.

## JavaScript `Date` pitfalls

`Date` is really an instant (milliseconds since 1970-01-01T00:00Z), but many of its methods silently use the **server's local time zone**:

| Local (avoid in backend logic) | UTC (use these) |
|---|---|
| `getFullYear()`, `getMonth()`, `getDate()` | `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()` |
| `getDay()` (weekday) | `getUTCDay()` (weekday, still not day-of-month!) |
| `setHours(0,0,0,0)` | `Date.UTC(y, m, d)` |
| `toLocaleDateString()` | `toISOString().slice(0, 10)` |

Other traps:

- **Months are 0-based**: `Date.UTC(2026, 2, 10)` is 10 **March**.
- **Rollover is silent**: `Date.UTC(2026, 1, 30)` is 2 March, not an error. Validate by round-tripping.
- **Parsing is inconsistent**: `new Date("2026-03-10")` is UTC midnight, but `new Date("2026-03-10T00:00")` (no `Z`) is **local** midnight. Always include `Z` or an offset when parsing timestamps.
- **`getUTCDay()` vs `getUTCDate()`**: weekday (0–6) vs day of month (1–31). A one-letter difference that has caused real outages (and one of the bugs in [module 09](../../09-testing/README.md)).

## Working with `YYYY-MM-DD` strings

```ts
export type CalendarDate = string; // or a branded type (module 08)

export const utcDateOf = (instant: Date) => instant.toISOString().slice(0, 10);

export function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
```

Why strings? They're unambiguous, JSON-friendly, compare correctly with `<` and `>` (because the format is fixed-width, biggest unit first), and sort correctly with `.sort()`. In Postgres, the `date` type plays the same role.

## Inject the clock

```ts
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
```

- Production passes `systemClock` in the composition root.
- Tests pass a controllable clock and move it explicitly.
- Everything in between asks `clock.now()`. A `new Date()` (with no arguments) in a service is a code smell.

`new Date(someString)` for **parsing** is fine anywhere; it's only *reading the current time* that must go through the clock.

## Edge cases worth testing

- Midnight: 23:59:59.999 vs 00:00:00.000 (UTC).
- Month ends (28/29/30/31 days) and year end (31 Dec → 1 Jan).
- Leap days: `2028-02-29` is valid, `2027-02-29` isn't.
- Inclusive ranges: "last 30 days including today" is `[today − 29, today]`.
- Duplicate inputs (the same day twice).

## When users have time zones

This checkpoint uses UTC days, which is a simplification. A real habit app would:

1. store each user's IANA time zone (e.g. `Europe/Berlin`, `Asia/Tokyo`);
2. compute "today" as the calendar date **in that zone**: `new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(clock.now())` gives `YYYY-MM-DD`;
3. keep storing calendar dates (not instants) for check-ins, because "I meditated on 10 March" is a calendar fact;
4. handle a user changing time zone (usually: just use the new zone from now on).

Never do calendar arithmetic by adding 24 hours to a local timestamp: on daylight-saving days, a day is 23 or 25 hours long. The `Temporal` API (arriving in JavaScript runtimes) models all of this properly with `Temporal.PlainDate`, `Temporal.ZonedDateTime` and friends.

## Storing time in Postgres (preview of module 12)

- Instants → `timestamptz` (stores UTC; converts on display).
- Calendar dates → `date`.
- Avoid `timestamp` (without time zone) for instants: it stores a wall-clock time with no zone, which becomes ambiguous the moment a second server or user zone appears.
