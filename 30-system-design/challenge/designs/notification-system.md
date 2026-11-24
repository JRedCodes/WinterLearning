<!--
THE PROMPT
"Design a notification service that other teams call to notify users by push (iOS/Android), email
and SMS. Some notifications are urgent (2FA codes, security alerts), most are not (marketing,
'someone liked your post'). 50M users, up to 1B notifications per day on peak days. Users can choose
which notifications they get on which channel."

The tests check headings, word minimums, a mermaid diagram, numbers in Estimates, and that you
discuss queues, retries, deduplication/idempotency and user preferences.
-->

# Notification System

## Requirements

<!-- Functional: send to one user or a segment, channels, templates, preferences/opt-out,
scheduling? Non-functional: latency for urgent vs bulk, delivery guarantee (at-least-once?),
no duplicates for the user, throughput, third-party provider limits. -->

## Estimates

<!-- Notifications/s average and peak, split by channel. Provider rate limits (e.g. an SMS provider
allowing a few hundred/s per account). Storage for a delivery log kept 30 days. -->

## API

<!-- The internal API other teams call (with an idempotency key!), preference endpoints, maybe
a status endpoint. -->

## Data Model

<!-- notification requests, delivery attempts/log, user preferences, device tokens, templates. -->

## High-Level Design

<!-- API → validation/preferences → per-channel queues → channel workers → providers.
Where do priorities live? -->

## Deep Dives

<!-- Suggested: priorities (urgent mustn't wait behind a marketing blast); retries with backoff and
a dead-letter queue; dedup and idempotency end to end; respecting provider rate limits;
bulk sends to millions of users. -->

## Trade-offs

<!-- At-least-once vs at-most-once, one queue vs queue per channel/priority, build vs buy providers. -->

## Failure Modes

<!-- A provider is down or slow, a bad template, a poison message, a worker crashes mid-batch,
a marketing blast floods the system. -->
