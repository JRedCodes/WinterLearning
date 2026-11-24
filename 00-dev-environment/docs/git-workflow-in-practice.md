# Git workflow in practice

The lesson covered the concepts. This page walks through the situations you'll actually hit in your first months on a team, and what a senior engineer would do in each.

## 1. A PR from start to merge

```bash
git switch main && git pull --ff-only
git switch -c module/00-dev-environment

# work in small steps; commit whenever something meaningful works
git add -p
git commit -m "feat(00): add compose file with healthchecks"
git add -p
git commit -m "feat(00): add Makefile targets"

git push -u origin HEAD
# open the PR on GitHub (or: gh pr create --fill)
```

A PR description that reviewers love:

```markdown
## What
Adds docker-compose (postgres 16 + redis 7 with healthchecks), Makefile targets,
and a `checkServices` script.

## Why
So `make up && make test` works on a fresh clone.

## How I tested
- `make reset && make up && make test` → all green
- Stopped redis (`docker compose stop redis`), ran `npm run check` → exit code 1, redis FAIL line
```

"How I tested" is the section juniors skip and seniors always read.

## 2. Main moved while you were working

Your PR shows "This branch is out-of-date" or has conflicts.

**If you're the only one on the branch**, rebase for a clean history:

```bash
git fetch
git rebase origin/main
# for each conflict: edit files, remove the <<<<<<< ======= >>>>>>> markers, then
git add <file>
git rebase --continue
npm test                       # ALWAYS re-run tests after resolving conflicts
git push --force-with-lease
```

**If others pushed to your branch too**, merge instead (`git merge origin/main`): no history rewrite, no surprises for them.

### Reading a conflict

```
<<<<<<< HEAD (your branch, or "ours")
const timeoutMs = 2000;
=======
const timeoutMs = Number(env.CHECK_TIMEOUT_MS ?? 2000);
>>>>>>> origin/main (theirs)
```

Don't just pick one side: understand **both** intents and write the code that satisfies both. During a rebase, "ours" and "theirs" are swapped compared with a merge, which confuses everyone. Read the actual content and ignore the labels.

## 3. Cleaning up before review

You have commits like `wip`, `fix typo`, `actually fix it`. Before asking for review you can tidy them with an interactive rebase (`git rebase -i origin/main`), marking commits as `fixup` to fold them into the previous one. A non-interactive way to get the same result:

```bash
git commit --fixup=<sha-of-commit-to-fix>
git rebase --autosquash origin/main
```

If your team squash-merges, don't bother: the PR becomes one commit anyway. Ask what the team does.

## 4. "I committed to main by accident"

```bash
git switch -c module/00-dev-environment   # new branch points at your commits
git switch main
git reset --hard origin/main              # put main back where the remote has it
git switch module/00-dev-environment
```

Nothing is lost: the branch still has your commits. If you already **pushed** to main, don't rewrite it. Use `git revert` and tell the team.

## 5. "I committed a secret"

1. **Rotate the secret immediately.** Assume it's compromised the moment it's pushed; bots scan public GitHub within minutes.
2. Remove it from the code and add the file to `.gitignore`.
3. If the repo is shared, coordinate a history rewrite (`git filter-repo`) and have everyone re-clone. For a private learning repo, rotation plus removal is usually enough.

The order matters: rewriting history without rotating leaves the leaked credential valid.

## 6. "Everything is broken and I don't know what I did"

```bash
git status            # where am I? mid-rebase? mid-merge?
git rebase --abort    # or: git merge --abort
git reflog            # every position HEAD has been in, with timestamps
git switch -c rescue HEAD@{5}   # go back to a known-good state on a new branch
```

`git reflog` is the undo history for git itself. Commits are almost never truly lost for at least 30 days.

## 7. Merge strategies on GitHub

| Button | Result on main | Good for |
|---|---|---|
| Create a merge commit | all branch commits + a merge commit | preserving exact history |
| Squash and merge | one commit per PR | most product teams; clean `git log` |
| Rebase and merge | branch commits replayed linearly | teams that curate commits carefully |

None is "correct". Consistency within a repo matters more than the choice.

## 8. Branch naming and protection

- Common patterns: `feat/rsvp-waitlist`, `fix/1234-timeout`, `alice/spike-kafka`. This repo uses `module/NN-slug`.
- **Branch protection** on `main` (required reviews, required CI checks, no force pushes) is standard at companies. It's why CI exists: nothing reaches main without passing tests.
