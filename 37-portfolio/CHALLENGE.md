# Challenge · Package Your Work

**Type:** 📝 Docs · **Est:** 3–4h · **Services:** none

## Scenario

> **DM from Sam (senior engineer, your mentor):** Congrats on finishing the capstone! 🎉 Before you start applying, let's make sure people can actually *see* what you did. Send me four things and I'll review them like a hiring manager would: your resume bullets, the README you'll put on the capstone repo, a plan for getting it live, and three stories you'd tell in an interview. Be specific, and don't put a number on anything you can't explain to me. I *will* ask.

## Your task

Fill in the four templates in `challenge/`. Guidance is in HTML comments inside each template (they don't count toward word minimums); replace every `TODO`.

| # | File | What |
|---|---|---|
| 1 | `RESUME_BULLETS.md` | Headline, 4+ capstone bullets, 6+ bullets from other modules, skills |
| 2 | `PROJECT_README.md` | The README for your capstone repo: overview, demo, features, architecture diagram, stack, getting started, design decisions, testing, next steps |
| 3 | `DEPLOY_PLAN.md` | How you'll run the capstone publicly: platform choice, architecture, data stores, secrets, domain/TLS, CI/CD, observability, cost & limits, rollback, launch checklist |
| 4 | `STORIES.md` | A 60-second project pitch and 3 STAR stories with reflections |

Base everything on **your own** capstone and modules. The lesson and `docs/` explain what good looks like.

## Acceptance criteria

The tests check structure and minimum substance. They can't judge quality; that's what the self-review below and Sam (or Claude) are for.

**RESUME_BULLETS.md**
- [ ] `## Headline` with at least 15 words
- [ ] `## Capstone` with at least 4 bullets and `## Projects` with at least 6 bullets
- [ ] `## Skills` with at least 3 bullets
- [ ] Every capstone/project bullet is 8–45 words, unique, and doesn't start with "Responsible for", "Worked on", "Helped", etc.
- [ ] At least half of those bullets contain a number

**PROJECT_README.md**
- [ ] Exactly one `#` title
- [ ] `## Overview` (40+ words), `## Demo` (10+ words), `## Features` (5+ bullets)
- [ ] `## Architecture` with a ` ```mermaid ` diagram and 40+ words of explanation
- [ ] `## Tech stack` (4+ bullets), `## Getting started` with a code block
- [ ] `## Design decisions` with 120+ words covering 3+ decisions (as `###` subsections or bullets)
- [ ] `## Testing` (30+ words), `## What I'd do next` (3+ bullets)

**DEPLOY_PLAN.md**
- [ ] Sections: Target platform (60+ words), Architecture (mermaid + 30+ words), Data stores (50+), Secrets & configuration (30+), Domain & TLS (20+), CI/CD (40+), Observability (30+), Cost & limits (30+), Rollback plan (40+)
- [ ] `## Launch checklist` with 6+ `- [ ]` items

**STORIES.md**
- [ ] `## Project pitch` with 50+ words
- [ ] At least 3 `## Story N: <title>` sections, each with `### Situation` (25+), `### Task` (15+), `### Action` (60+), `### Result` (25+), `### Reflection` (20+)

**All files**
- [ ] No leftover `TODO` or `<Placeholder>` text outside comments
- [ ] `npm test` passes

## Getting started

```bash
cd 37-portfolio/challenge
make install
make test        # red: the templates are empty
make dev         # re-runs the checks every time you save a file
```

Failure messages tell you exactly which section is short and by how much.

## Rules

- Don't modify the tests.
- **Every number must be true** and explainable: where it came from and how you measured it.
- Write in your own words about your own work. Don't copy the examples from the `solutions` branch.
- Don't quote prices or free-tier limits from memory in `DEPLOY_PLAN.md`. Check the current official pages and note the date.
- No secrets, real credentials or personal contact details in these files (they're in a repo).

## Stretch goals

1. **Actually deploy it.** Follow your plan, put the live URL in the README's Demo section, and add a LOG.md entry about what went wrong on the first try.
2. Copy `PROJECT_README.md` into your capstone repo and get a friend to do the one-minute test from [docs/project-readme.md](docs/project-readme.md).
3. Run the k6 load test from module 29 against your capstone and add the real p95/throughput numbers to a bullet.
4. Record yourself telling all three stories. Cut anything that runs over 3 minutes.
5. Turn the bullets into a one-page resume and ask Claude to review it like a hiring manager for a junior backend role.
6. Polish your GitHub profile: pin six repos, write a profile README.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/37-portfolio`, push and open a PR. CI runs this module's tests. Ask Claude to review the write-ups: *"Review these as a hiring manager for a junior backend role. Be blunt about vague bullets, unverifiable numbers and weak stories."*
3. From the repo root: `npm run progress -- 37` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md). Out loud.
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the example write-ups: `git diff main origin/solutions -- 37-portfolio/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
