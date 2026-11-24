<!--
THE PROMPT
"Design the home feed for a social app like a simplified Twitter/X or Instagram. Users follow other
users. When you open the app you see posts from the people you follow, newest first. Assume 200M
daily active users. Some accounts have tens of millions of followers."

Structure comes from TEMPLATE.md (see the lesson, section 2). Problem-specific nudges are below.
The tests check headings, word minimums, a mermaid diagram, numbers in Estimates, and that you
discuss fan-out, the celebrity problem and pagination.
-->

# News Feed

## Requirements

<!-- Functional: post, follow, read the feed (paginated). Media? Likes? Ranking or chronological?
Decide and say so. Non-functional: feed latency, how fresh the feed must be (seconds? a minute?),
availability vs consistency for the feed. -->

## Estimates

<!-- Posts per day, feed reads per day, average and p99 follower counts. How many feed entries
would fan-out on write create per second? How big is a cached feed of 500 post ids per user? -->

## API

<!-- Creating a post, following, reading the feed with cursor pagination. -->

## Data Model

<!-- posts, follows (both directions?), a precomputed feed/timeline store. Which store for each? -->

## High-Level Design

<!-- Write path (new post) and read path (open the feed). Where does the fan-out happen? -->

## Deep Dives

<!-- Suggested: fan-out on write vs read vs hybrid (celebrities!); feed cache structure and size;
pagination over a feed that changes while you scroll; media via object storage + CDN. -->

## Trade-offs

<!-- Freshness vs cost, push vs pull, chronological vs ranked, storage of precomputed feeds. -->

## Failure Modes

<!-- Fan-out workers fall behind; feed cache cluster loses a node; a celebrity posts during a
spike; the follow graph store is slow. -->
