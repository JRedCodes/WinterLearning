# Schema evolution playbook

Events are an API with a very long tail: every version you ever published stays readable for the topic's whole retention period, and possibly forever in a data lake. Treat the event schema like a public REST API, with more care, because you can't see who's reading it.

## Make the version explicit

Put the schema version where consumers can read it **before** parsing the payload:

```
headers:
  event-type:    OrderPlaced
  event-version: 2
  event-id:      7d1c…
```

A header is better than a payload field because a consumer can route, skip or dead-letter a record without understanding its body. With a schema registry, the record carries a schema id instead, and the registry knows the version.

## The safe-change checklist

✅ **Usually safe (backward and forward compatible):**
- Adding an **optional** field (consumers must ignore unknown fields: zod's default `object()` strips them, don't use `.strict()` on event schemas).
- Adding a new event **type** (consumers must ignore types they don't handle).
- Adding a value to an enum, *if* consumers handle unknown values gracefully (this one bites people constantly).

❌ **Breaking:**
- Removing or renaming a field.
- Changing a field's type or structure (`totalCents` → `total: { amountCents, currency }`).
- Making an optional field required.
- Changing a field's **meaning or unit** while keeping its name and type. This is the worst kind, because nothing fails: everything is silently wrong.

## Rolling out a breaking change (consumers first)

1. **Define v2** next to v1 in the shared contract.
2. **Teach every consumer v2** (upcaster or dual parsing) and deploy them. They still receive only v1, so nothing changes yet. Verify with tests that feed both versions.
3. **Switch the producer to v2.** Consumers handle the mix.
4. **Wait out retention.** v1 records age out of the topic. Keep the v1 upcaster as long as you might replay older data. It's cheap, so many teams keep it forever.

Doing it in the other order (producer first) is exactly the challenge's bug #4: consumers crash on the new shape, or (worse) crash on the *old* one after someone "updates the consumer to v2" without keeping v1 support.

## Upcasters

An upcaster converts version N to version N+1. Chain them so the domain code only sees the latest version:

```ts
const steps: Record<string, (p: any) => unknown> = {
  "1": (v1) => ({ ...omit(v1, "totalCents"), total: { amountCents: v1.totalCents, currency: "EUR" } }),  // → v2
  "2": (v2) => ({ ...v2, channel: v2.channel ?? "web" }),                                              // → v3
};

function upcast(version: number, payload: unknown, latest = 3) {
  let current = payload;
  for (let v = version; v < latest; v++) current = steps[String(v)]!(current);
  return LatestSchema.parse(current);
}
```

Rules of thumb:

- **Validate the input version, then upcast.** Validate v1 with the v1 schema, so a corrupt v1 record is reported as such instead of producing a strange v2.
- **Defaults must be truthful.** "v1 had no currency" is fine to default to EUR only because v1 was *always* EUR. If you don't know the right value, the field must stay optional in the new version.
- **Unknown future versions are permanent errors.** Dead-letter them. Don't guess.
- **Upcasters are pure functions**, which makes them trivial to unit-test with real historical payloads. Keep a folder of sample events per version as test fixtures.

## Downcasting and dual publishing

If you can't update all consumers first (other teams, external partners), the producer can **publish both**: v1 to `orders.v1` and v2 to `orders.v2`, from the same outbox transaction, until every consumer has moved. It costs storage and discipline, and it's the standard approach when the topic is consumed outside your team.

## Schema registries

At scale, compatibility is enforced by a **schema registry** (Confluent Schema Registry, Apicurio, AWS Glue): producers register the schema, the registry rejects incompatible changes according to a compatibility mode (BACKWARD, FORWARD, FULL), and records carry a schema id. Avro and Protobuf have well-defined evolution rules (field numbers in Protobuf, defaults in Avro) that make many changes safe by construction. JSON with zod, as in this repo, is the lightweight version: you enforce compatibility with tests and code review instead of a registry.
