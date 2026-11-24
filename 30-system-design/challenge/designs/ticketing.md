<!--
THE PROMPT
"Design a ticketing platform like a simplified Ticketmaster. Organizers create events with a seat map.
Fans browse events, pick specific seats, hold them for a few minutes while they pay, and receive a
ticket. Most of the year traffic is modest, but a big on-sale gets 2M people trying to buy 50,000
seats in the first minutes. Never sell the same seat twice."

This one preps the capstone (module 36): it is worth doing carefully.
The tests check headings, word minimums, a mermaid diagram, numbers in Estimates, and that you
discuss double-booking, expiring holds, idempotent payments and the on-sale spike.
-->

# Ticketing Platform

## Requirements

<!-- Functional: browse/search events, view seat map with availability, hold seats, pay, issue
tickets, cancel/refund? Non-functional: correctness (no double booking, strong consistency for
seats), latency of seat map, behaviour under a 100x spike, fairness. -->

## Estimates

<!-- Normal vs on-sale traffic, seat-map reads/s vs hold writes/s, rows per event, how long
the on-sale lasts. Which part needs strong consistency, and how many writes/s does it get? -->

## API

<!-- Events, seat map, POST holds, POST orders/checkout with an idempotency key, ticket retrieval. -->

## Data Model

<!-- events, venues/seats, seat inventory per event with status (available/held/sold) and hold
expiry, orders, payments, tickets. Which constraints enforce "never sell twice"? -->

## High-Level Design

<!-- Browse path (cache/CDN heavy) vs buy path (transactional). Payment provider integration.
Real-time seat-map updates? -->

## Deep Dives

<!-- Suggested: seat holds and expiry (DB row locks vs conditional updates vs Redis locks); the
on-sale spike (virtual waiting room, admission control); payment flow and idempotency (what if
the payment succeeds but your service crashes before recording it?); caching availability
without lying too much. -->

## Trade-offs

<!-- Strong consistency on the buy path vs availability, waiting room fairness vs simplicity,
pessimistic vs optimistic locking. -->

## Failure Modes

<!-- Payment provider timeouts, hold-expiry job falls behind, DB primary failover mid on-sale,
bots, cache serving stale availability. -->
