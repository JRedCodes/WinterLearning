# Interview stories: STAR, pitches and trade-offs

> How to prepare project stories that hold up when an interviewer keeps asking "why?".

## Building a story bank

Behavioural and project questions repeat. Prepare a small bank of stories that each cover several themes:

| Theme interviewers probe | Story source in this course |
|---|---|
| A hard bug you fixed | race conditions (15), the incident in 24, the broken manifests in 35 |
| Improving something | N+1 / indexes (14), caching (18), refactoring the god file (06) |
| A trade-off decision | sessions vs JWT (22), outbox vs direct publish (33), deploy platform choice (37) |
| Learning something fast | Kafka (32), Kubernetes (34) |
| Failure / mistake | a deploy that broke, a test you wrote wrong, a design you had to redo |
| Working with feedback | a PR review that changed your approach |

Three strong stories, flexibly told, cover most questions.

## STAR, with proportions

| Part | Share | Contents |
|---|---|---|
| Situation | ~10% | where, what system, what was at stake |
| Task | ~5% | what *you* had to achieve |
| Action | ~60% | what you did, step by step, *why*, alternatives considered |
| Result | ~15% | outcome, measured if possible, how you verified it |
| Reflection | ~10% | what you learned or would do differently |

Aim for **2–3 minutes** spoken. Practice with a timer.

## The 60-second pitch

"Tell me about a project" is often the first question. Structure:

1. **What it is** (1 sentence): "An event ticketing platform: browse events, hold seats, book them, get notified."
2. **What makes it interesting** (2 sentences): "The hard part was preventing double booking when many users hit the same seats, and keeping other services in sync without losing events."
3. **How you solved it** (2–3 sentences): key techniques.
4. **Proof** (1 sentence): tests, load test, deployment.
5. **What's next** (1 sentence): an honest limitation.

Then **stop** and let them choose where to dig.

## The "why" ladder

For each major decision, prepare three levels:

```
What did you do?    → "Seat holds expire after 10 minutes."
Why that way?       → "Holds in Postgres with an expires_at, checked in the booking query, so expiry needs no background job to be correct."
What are the limits? → "Expired rows pile up, so a periodic job cleans them; the realtime seat map may show a seat as held a few seconds after expiry."
```

When you reach the edge of what you know, say so and reason: "I haven't measured that. My expectation is X because Y, and I'd check it by Z."

## Talking about trade-offs

A simple frame: **"I chose A over B because C; the cost is D, which is acceptable because E."**

- "I chose server-side sessions over JWTs because I needed instant logout and revocation; the cost is a Redis round trip per request, which is acceptable because it's sub-millisecond on the same network."
- "I used a single Postgres instance; it's a single point of failure, acceptable for a demo, and at a company I'd use a managed service with a standby replica."

## Questions to rehearse

- Walk me through the architecture of your capstone.
- What happens, step by step, when a user books a seat?
- What was the hardest bug and how did you find it?
- How would it handle 100x traffic? What breaks first?
- Why Kafka? Would you use it at a startup with 1,000 users?
- How do you know your code works?
- What would you do differently if you started over?
- Tell me about a time you got critical feedback.

## Delivery tips

- Say **"I"** for your actions. If someone else did part of it, say so.
- Draw. Offer to sketch the architecture (whiteboard or shared doc).
- Use numbers you can defend.
- Pause. It's fine to take five seconds to think.
- End answers cleanly. "...and that's why I now look for read-then-write patterns in reviews." Then stop.
- Record yourself once. It's uncomfortable and extremely effective.

## Questions to ask them

Good questions show you think like an engineer: *How do you deploy, and how often? What does on-call look like for juniors? How are design decisions made and documented? What would make someone successful in their first 90 days?*
