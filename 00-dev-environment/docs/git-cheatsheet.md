# Git cheat sheet

## Daily loop

```bash
git status                         # what changed? (run it constantly)
git switch main && git pull        # start from the latest main
git switch -c module/00-dev-environment   # new branch
git add -p                         # stage hunk by hunk (review as you go)
git commit -m "feat(00): add compose file"
git push -u origin HEAD            # first push; later just `git push`
```

## Looking around

```bash
git log --oneline --graph --decorate --all   # the shape of history
git log -p -- path/to/file                   # every change to one file
git diff                                     # unstaged changes
git diff --staged                            # what the next commit contains
git diff main...HEAD                         # what my branch adds vs main
git show <sha>                               # one commit
git blame -w path/to/file                    # who last touched each line (ignore whitespace)
```

## Branches

```bash
git branch                       # local branches
git branch -a                    # include remote-tracking branches
git switch <branch>              # move to a branch
git branch -d <branch>           # delete a merged branch (-D to force)
git fetch --prune                # update remote branches, drop deleted ones
```

## Keeping your branch up to date

```bash
# Option A: merge main into your branch (safe, adds a merge commit)
git fetch && git merge origin/main

# Option B: rebase onto main (linear history, rewrites YOUR commits)
git fetch && git rebase origin/main
#   conflict? fix the files, then:
git add <files> && git rebase --continue      # or: git rebase --abort
git push --force-with-lease                   # never plain --force
```

## Undo table

| I want to... | Command |
|---|---|
| discard unstaged changes to a file | `git restore <file>` |
| unstage a file (keep the change) | `git restore --staged <file>` |
| fix the last commit message / add a forgotten file | `git add <file> && git commit --amend` |
| undo the last commit, keep changes staged | `git reset --soft HEAD~1` |
| undo the last commit, keep changes unstaged | `git reset HEAD~1` |
| throw away the last commit entirely | `git reset --hard HEAD~1` ⚠️ |
| undo a commit that's already pushed/shared | `git revert <sha>` (new commit that inverts it) |
| park work-in-progress | `git stash push -m "wip"` → later `git stash pop` |
| find a "lost" commit after a bad reset/rebase | `git reflog` then `git switch -c rescue <sha>` |

Rule: `reset`/`amend`/`rebase` rewrite history; use them only on commits nobody else has. On shared branches, `revert`.

## Conventional commits

```
feat(scope): add thing          fix(scope): correct thing
refactor: restructure, no behavior change
test: add missing cases          docs: explain X
chore: bump deps / tooling       feat!: breaking change
```

Summary line: imperative mood ("add", not "added"), ≤ 72 chars, no trailing period. Body: why.

## Finding the commit that broke something

```bash
git bisect start
git bisect bad                 # current commit is broken
git bisect good <sha-or-tag>   # this older one worked
# git checks out a midpoint; test it, then:
git bisect good                # or: git bisect bad
git bisect run npm test        # or let a command decide automatically
git bisect reset
```

## Config worth setting once

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
git config --global pull.rebase false        # or true, but choose explicitly
git config --global push.autoSetupRemote true
git config --global rerere.enabled true      # remembers conflict resolutions
```

## This repo

```bash
git switch -c module/NN-slug                 # one branch per module
npm run progress -- NN                       # from repo root: run tests, tick roadmap
git diff main origin/solutions -- NN-slug/   # compare with the reference AFTER you finish
```
