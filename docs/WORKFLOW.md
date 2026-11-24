# 🔁 Workflow

How to work through a module the way you'd work on a real team.

## 1. Start a module

```bash
git switch main && git pull
npm run next                                  # what's next?
git switch -c module/06-layered-architecture  # one branch per module
```

Read the module's `README.md` (the lesson) and skim `docs/` **before** opening the challenge. The lesson is written so you can do the challenge without searching the internet. If something is unclear, that's a gap worth noting in your log.

## 2. Red → green

```bash
cd 06-layered-architecture/challenge
make install
make up            # only if the module uses Postgres/Redis/Kafka (needs Docker)
make test          # red: the tests ARE the acceptance criteria
npm run test:watch # rerun on save while you work
```

- **Don't edit the provided tests.** If you're sure one is wrong, note it in the PR description.
- Commit small and often, with messages that explain *why*: `feat(06): extract RsvpService from route handlers`. ([Conventional commits](https://www.conventionalcommits.org/) are a good habit.)
- Stuck for 30+ minutes? Open **one** hint in `HINTS.md`, then try again.

## 3. Open a pull request

```bash
git push -u origin module/06-layered-architecture
gh pr create --fill     # or use the GitHub UI
```

The PR template asks for a short summary, a checklist, and **the part you're least sure about**. CI (`.github/workflows/ci.yml`) runs the tests for every module your PR touches. A green check means done.

## 4. Get a code review

Passing tests ≠ good code. Before merging, do one of these:

- **Self-review:** read your diff on GitHub as if a teammate wrote it. Check the PR checklist, especially separation of concerns.
- **Ask Claude to review it:** share the PR (or paste the diff) and ask something like:
  > Review my PR for module 06 like a senior backend engineer. Focus on separation of concerns, naming, error handling and edge cases the tests don't cover. Don't rewrite it for me. Point out issues and explain why.
- Fix what's worth fixing, then **merge** into `main`.

Learning to receive review without getting defensive, and to push back with reasons when you disagree, is a job skill in its own right.

## 5. Close the loop

```bash
npm run progress -- 06         # runs the tests; ticks the roadmap in README.md
```

Then:

1. **Answer `INTERVIEW.md`** in your own words. Say it out loud first, then write it.
2. **Add a `LOG.md` entry**: what you did, and what confused you.
3. **Compare with the reference solution:**
   ```bash
   git fetch origin solutions
   git diff main origin/solutions -- 06-layered-architecture/
   git show origin/solutions:06-layered-architecture/SOLUTION.md
   git show origin/solutions:06-layered-architecture/INTERVIEW.md   # model answers
   ```
   Different isn't wrong. Read SOLUTION.md's "alternatives" section and decide which trade-offs you prefer.
4. Commit the progress and log changes on `main`.

## Solutions etiquette

| Situation | Do |
|---|---|
| Haven't started | ❌ Don't peek. You'll recognize the solution, not learn it. |
| Stuck < 30 min | Keep going. Re-read the lesson section. |
| Stuck > 30 min | `HINTS.md`, one hint at a time |
| Exhausted all hints | Look at only the one file you're stuck on in `solutions`, then close it and write it yourself |
| Tests green | ✅ Read the full solution and SOLUTION.md. This is where a lot of learning happens. |

## Checkpoints

The `🏁 checkpoint` modules have **no scaffold**: you design the structure yourself. Treat them like a take-home assignment: time-box them, write a short README in your `challenge/`, and keep the PR clean. They're the closest thing in this repo to a real interview exercise, and they make good portfolio pieces.

## If the repo gets updated

If this curriculum is updated upstream (new modules, fixes), merge `main` into your branch as usual. Your work only touches `challenge/` folders, LOG.md and .progress.json, so conflicts should be rare.
