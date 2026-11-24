# Challenge · Five System Designs

**Type:** 📝 Docs · **Est:** 7–8h (about 1.5h per design) · **Services:** none

## Scenario

> **#eng-mentoring** · *Dana (staff engineer):* You've built caches, rate limiters, queues and a real-time server. Now I want to see you put them together. Before your loop with the platform team, write up these five designs the way you'd present them in a design review: requirements with numbers, estimates that actually drive decisions, a diagram, and real deep dives on the hard parts. I'll read them like an interviewer would. The ticketing one matters most: it's the basis for your capstone. Please don't name-drop technology you can't justify. 🙂

## Your task

Write five design documents in `challenge/designs/`. Each file already exists with the template's headings and problem-specific guidance in HTML comments.

| # | File | Prompt (full version at the top of each file) |
|---|---|---|
| 1 | `designs/news-feed.md` | Home feed for a 200M-DAU social app with celebrity accounts |
| 2 | `designs/notification-system.md` | Push/email/SMS notifications for other teams, 1B/day peak, user preferences |
| 3 | `designs/chat.md` | WhatsApp-lite: 1:1 + small groups, receipts, offline delivery |
| 4 | `designs/rate-limiter.md` | Distributed rate limiter for an API gateway at 500k req/s across 2 regions |
| 5 | `designs/ticketing.md` | Ticketmaster-lite: seat holds, payments, 2M fans for 50k seats, never double-sell |

For each design, follow the framework from the lesson, one `##` section per step (see [`challenge/TEMPLATE.md`](challenge/TEMPLATE.md)):

1. **Requirements**: label `Functional` and `Non-functional` explicitly; give numbers; list what's out of scope.
2. **Estimates**: QPS average and peak, storage, bandwidth or connections, and a "so what" that names which numbers shape the design.
3. **API**: endpoints (`POST /v1/...`) or messages, in a code block or table.
4. **Data Model**: entities, keys, access patterns, indexes, which store and why; the shard key if you shard.
5. **High-Level Design**: a ` ```mermaid ` diagram plus a walk-through of the main flows.
6. **Deep Dives**: at least two `###` subsections on the hardest parts, each with options compared and a choice.
7. **Trade-offs**: at least three, each with what you gave up and when you'd decide differently.
8. **Failure Modes**: at least four scenarios with impact and mitigation (a table works well).

Suggested order: rate limiter (you built it in module 19, so it's the gentlest), notification system, news feed, chat, ticketing.

## Acceptance criteria

The tests are a lint, not a grade: they check structure and minimum depth. Dana's bar (and the model answers on the `solutions` branch) is higher.

- [ ] All five files exist with one `#` title naming the system.
- [ ] Each has the eight `##` sections in the template's order.
- [ ] **Requirements** (≥ 90 words) labels functional and non-functional requirements.
- [ ] **Estimates** (≥ 70 words) contains at least six numbers.
- [ ] **API** (≥ 40 words) lists endpoints like `POST /...` or shows messages in a code block.
- [ ] **Data Model** (≥ 60 words).
- [ ] **High-Level Design** (≥ 100 words) contains a ` ```mermaid ` diagram.
- [ ] **Deep Dives** (≥ 250 words) has at least two `###` subsections.
- [ ] **Trade-offs** (≥ 100 words) has at least three items (bullets, table rows or `###`).
- [ ] **Failure Modes** (≥ 80 words) has at least four items.
- [ ] Each design discusses its central difficulties (for example, the news feed must talk about fan-out, celebrities and pagination; the test failure message lists anything missing).
- [ ] No leftover `TODO`s or `<Placeholders>` outside comments.
- [ ] `TEMPLATE.md` keeps all its headings (module 31 reuses it).

Word counts exclude HTML comments, code blocks and diagrams, so the guidance comments and your mermaid don't count.

## Getting started

```bash
cd 30-system-design/challenge
make install
make test        # ~45 failures: every section is still empty
make dev         # re-runs the checks every time you save a design
```

Read [docs/worked-example-url-shortener.md](docs/worked-example-url-shortener.md) first: it shows the depth and tone to aim for. Keep [docs/estimates-cheatsheet.md](docs/estimates-cheatsheet.md) and [docs/building-blocks.md](docs/building-blocks.md) open while you write.

To preview mermaid diagrams, use your editor's Markdown preview (VS Code has extensions for mermaid) or paste them into the Mermaid Live Editor at https://mermaid.live.

## Rules

- Don't modify the tests or remove headings from the template.
- Write in your own words. Reading other designs for inspiration is fine; copying isn't, and it defeats the point.
- Every component in a diagram needs a reason in the text. If you can't justify it with a requirement or a number, remove it.
- Timebox: about 90 minutes per design. An interview gives you 45. Unfinished but honest beats polished but vague.

## Stretch goals

1. **Present one out loud.** Set a 45-minute timer and talk through the ticketing design to a friend, a rubber duck or a recording. Note where you got stuck.
2. **Design a sixth system** using `TEMPLATE.md`: a web crawler, a distributed key-value store, a ride-hailing dispatch or a video upload pipeline.
3. **10x it.** Pick one design and write a short "what changes at 10x and 100x" appendix: which component breaks first, and what replaces it?
4. **Cost it.** Rough monthly cloud cost for the notification system's peak (instances, Redis, queue, provider fees). Which line dominates?

## Done?

1. `npm test` is green.
2. Commit on your branch `module/30-system-design`, push and open a PR. Ask Claude to review the designs like an interviewer would: "poke holes in my ticketing design".
3. From the repo root: `npm run progress -- 30` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md). They're the questions interviewers ask *about* designs.
5. Add an entry to [LOG.md](../LOG.md): which design was hardest, and why?
6. Compare with the model write-ups: `git diff main origin/solutions -- 30-system-design/` (and read `SOLUTION.md` on that branch). Compare your deep dives with the model ones: did you pick the same hard parts?

Stuck? → [HINTS.md](HINTS.md)
