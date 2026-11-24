# Hints · Portfolio & Job Readiness

Open one hint at a time. Give each a real try before opening the next.

## 1: RESUME_BULLETS.md

<details><summary>Hint 1</summary>

Don't start from a blank page. Open your `LOG.md` and the CHALLENGE.md of your favourite modules: the acceptance criteria are a list of things you built and proved.
</details>

<details><summary>Hint 2</summary>

Look for numbers you already have: the concurrency level in your tests (20, 50 requests), queries per request before/after in module 14, number of vulnerabilities fixed in 25, number of tests, designs written in 30. The idea bank in [docs/resume-bullets.md](docs/resume-bullets.md) maps modules to angles.
</details>

<details><summary>Hint 3</summary>

Write each bullet as: **verb** + **what** + **how** + **result**. For example: "Eliminated seat overbooking under 50 concurrent requests by replacing read-then-write logic with a conditional UPDATE and a unique constraint." Then cut every word that doesn't add information. If a test complains about length, split one bullet into two.
</details>

## 2: PROJECT_README.md

<details><summary>Hint 1</summary>

Your capstone `DESIGN.md` (module 36) already has most of the raw material: architecture, data model, decisions. The README is a shorter, more inviting version of it.
</details>

<details><summary>Hint 2</summary>

For the architecture diagram, start with 5–7 boxes: web, API, worker, Postgres, Redis, Kafka. Then pick one flow (holding a seat) and narrate it in a paragraph under the diagram. For decisions, look at your `DECISIONS.md` files from modules 22, 23 and 27.
</details>

<details><summary>Hint 3</summary>

For each design decision write four short lines: **Decision**, **Alternatives**, **Why**, **Cost**. Three decisions of ~50 words each clears the 120-word minimum and reads far better than one long paragraph. See the example in [docs/project-readme.md](docs/project-readme.md).
</details>

## 3: DEPLOY_PLAN.md

<details><summary>Hint 1</summary>

Decide your goal first: fastest URL (PaaS), learning ops (VPS + Compose + reverse proxy), or showing Kubernetes (kind + demo video). The flowchart in [docs/deployment-options.md](docs/deployment-options.md) helps.
</details>

<details><summary>Hint 2</summary>

Walk through a deploy in your head: push → CI tests → image build tagged with the SHA → migrations → rolling deploy → readiness checks. Each arrow is a sentence in your CI/CD section. For rollback, ask: "the new version is broken, what do I type?", and "what if the migration was the problem?".
</details>

<details><summary>Hint 3</summary>

The launch checklist is the plan compressed into actions: budget alert set, secrets created, migrations run, health check monitored, rate limits on, demo data seeded, restore tested, README demo link updated. For costs, write your budget ceiling and how you enforce it rather than quoting prices.
</details>

## 4: STORIES.md

<details><summary>Hint 1</summary>

The best stories have tension: something didn't work. Think about where you were stuck longest in the course. That's a story.
</details>

<details><summary>Hint 2</summary>

Pick three that cover different themes: a hard bug (e.g. a race condition in 15 or 36), a trade-off decision (sessions vs JWT, outbox vs direct publish, the deploy platform), and a learning/failure story (first Kafka consumer, a broken deploy, a refactor that went wrong).
</details>

<details><summary>Hint 3</summary>

Make the Action section a sequence: "First I reproduced it with a test... Then I looked at... I considered A and B... I chose B because... Finally I added...". Say "I". End the Result with how you verified it, and the Reflection with one thing you'd now do differently or always check.
</details>
