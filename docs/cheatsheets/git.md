# Git cheat sheet

> The commands you'll use every day in this repo, grouped by what you're trying to do. Taught in [00 · Dev Environment](../../00-dev-environment/README.md).

## The module loop (this repo)

```bash
git switch main && git pull                      # start from an up-to-date main
git switch -c module/13-node-postgres            # one branch per module: module/NN-slug
# ...work, commit small and often...
git push -u origin module/13-node-postgres       # first push sets the upstream
gh pr create --fill                              # open the PR (or use the GitHub UI)
# after merge:
git switch main && git pull
git branch -d module/13-node-postgres            # delete the merged local branch
```

Compare with the reference solution **after** your tests pass:

```bash
git fetch origin solutions
git diff main origin/solutions -- 13-node-postgres/
git show origin/solutions:13-node-postgres/SOLUTION.md   # read the walkthrough without switching branches
```

## Setup (once)

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
git config --global pull.rebase true          # pull = fetch + rebase, no merge bubbles
git config --global push.autoSetupRemote true # `git push` on a new branch just works
git config --global rerere.enabled true       # remember conflict resolutions
```

## Look around

| Command | What it tells you |
|---|---|
| `git status -sb` | short status + branch and ahead/behind |
| `git log --oneline --graph --decorate -20` | recent history as a graph |
| `git log -p -- path/to/file` | every change to one file |
| `git diff` | unstaged changes |
| `git diff --staged` | what the next commit will contain |
| `git diff main...HEAD` | everything your branch adds since it forked from main |
| `git show <sha>` | one commit in full |
| `git blame -w path` | who last touched each line (ignoring whitespace) |
| `git log -S "someFunction"` | commits that added/removed that string |

## Commit

```bash
git add -p                         # stage hunk by hunk (review as you go)
git add src/ test/                 # stage paths
git commit -m "feat(13): add PgTaskRepository"
git commit --amend                 # fix the last commit (message or content), only if not pushed/shared
git commit --amend --no-edit       # add staged changes to last commit, keep message
```

Conventional commit prefixes: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`. Put the module id in the scope: `fix(15): lock seats in id order to avoid deadlock`. The subject says *what*, the body says *why*.

## Branches

```bash
git branch                         # local branches (* = current)
git branch -a                      # include remote-tracking branches
git switch <branch>                # move to a branch
git switch -c <new>                # create + move
git branch -m <new-name>           # rename current branch
git branch -D <branch>             # force delete (unmerged work is lost)
git push origin --delete <branch>  # delete the remote branch
```

## Sync with main

```bash
git fetch origin
git rebase origin/main             # replay your commits on top of latest main (linear history)
# conflicts? edit files, then:
git add <file> && git rebase --continue
git rebase --abort                 # bail out, back to where you started
git push --force-with-lease        # required after rebasing a pushed branch; refuses if someone else pushed
```

**Rebase vs merge:** rebase rewrites *your* branch's commits so history is a straight line. Merge keeps history exactly as it happened and adds a merge commit. Rebase your own feature branch freely; never rebase a branch other people have built on.

## Clean up history before a PR

```bash
git reset --soft origin/main       # un-commit everything on the branch but keep changes staged
git commit -m "feat(13): ..."      # ...then recommit as one or a few clean commits
git commit --fixup <sha>           # mark a commit as a fix for an earlier one
git rebase --autosquash origin/main  # fold fixups into their targets (non-interactive)
```

## Undo things

| Situation | Command |
|---|---|
| Discard unstaged changes to a file | `git restore path` |
| Unstage a file (keep changes) | `git restore --staged path` |
| Undo last commit, keep changes staged | `git reset --soft HEAD~1` |
| Undo last commit, keep changes unstaged | `git reset HEAD~1` |
| Throw away last commit and its changes | `git reset --hard HEAD~1` (destructive) |
| Undo a pushed commit safely | `git revert <sha>` (new commit that inverts it) |
| "I lost a commit" | `git reflog` then `git switch -c rescue <sha>` |
| Get one file from another branch | `git restore --source=main -- path` |

## Stash

```bash
git stash push -m "wip: half-done migration"
git stash list
git stash pop                      # apply + drop the newest
git stash apply stash@{1}          # apply without dropping
git stash push -u                  # include untracked files
```

## Find the commit that broke something

```bash
git bisect start
git bisect bad                     # current commit is broken
git bisect good <sha>              # this older one worked
# git checks out a midpoint; run `make test`, then mark good/bad until it names the culprit
git bisect run npm test            # or let git run the tests for you
git bisect reset
```

## .gitignore essentials (already in this repo)

```
node_modules/
dist/
.env
.env.*
!.env.example
package-lock.json
coverage/
```

`git rm --cached <file>` stops tracking a file you committed by mistake (then add it to `.gitignore`).

## Gotchas

- **Committed a secret?** Deleting it in a new commit doesn't remove it from history. Rotate the secret first, then clean history.
- `git push --force` can overwrite a teammate's work. Use `--force-with-lease`.
- `git reset --hard` and `git clean -fd` delete work that git can't always recover. Run `git status` first.
- Detached HEAD (after `git checkout <sha>`) is fine for looking. Create a branch before committing there.
- Line endings: on Windows set `git config --global core.autocrlf input` to avoid noisy diffs.
- A huge PR is a slow review. One module per branch keeps PRs focused.
