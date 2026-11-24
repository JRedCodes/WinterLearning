<!--
THE PROMPT
"Design a WhatsApp-lite: 1:1 and small group chats (up to 100 members), text messages, delivered/read
receipts, works on flaky mobile networks, messages are delivered to users who were offline when the
message was sent. 100M DAU, each sends ~40 messages a day."

The tests check headings, word minimums, a mermaid diagram, numbers in Estimates, and that you
discuss persistent connections, ordering, offline delivery and how a message finds the server
holding the recipient's connection.
-->

# Chat (WhatsApp-lite)

## Requirements

<!-- Functional: send/receive, groups, receipts, history sync on a new device? online presence?
Non-functional: end-to-end latency, ordering guarantee (per conversation?), durability (never lose
an acknowledged message), availability. -->

## Estimates

<!-- Messages/s average and peak, concurrent connections, connections per gateway server,
storage per day and per year. -->

## API

<!-- Connection protocol (WebSocket messages: send, ack, deliver, receipt) and the few REST
endpoints (history sync, create group). -->

## Data Model

<!-- messages partitioned by conversation, conversation membership, per-device delivery state,
a connection/presence registry. Which store fits a write-heavy, time-ordered workload? -->

## High-Level Design

<!-- Clients ↔ gateways (stateful!) ↔ chat service ↔ storage, plus a way to route a message to
the gateway the recipient is connected to. Walk through: A sends to B while B is online; while
B is offline. -->

## Deep Dives

<!-- Suggested: message ids and ordering (per-conversation sequence vs timestamps); delivery
guarantees with client acks and retries (dedupe by client message id); routing between gateways;
group fan-out; offline delivery and push notifications. -->

## Trade-offs

<!-- WebSocket vs long polling, storing messages forever vs until delivered, SQL vs wide-column. -->

## Failure Modes

<!-- A gateway dies with 500k connections on it, a message is sent twice by a retrying client,
the routing registry is stale, a region partition. -->
