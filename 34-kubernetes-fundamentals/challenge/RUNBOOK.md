# Runbook · kudos-api on a local kind cluster

> Write this so a teammate who has never touched this repo can copy-paste their way from
> nothing to a running, rolling-updated, rolled-back deployment. Put every command in a
> fenced ```bash block (the tests only look inside code blocks). Run each step yourself
> and paste what you actually ran.

## Prerequisites

TODO: which tools (and roughly which versions) must be installed, and how to check.

## 1. Create the cluster

TODO: create a kind cluster and point kubectl at it.

## 2. Build and load the image

TODO: install deps (the Dockerfile needs package-lock.json), build the image with the exact
tag your Deployment uses, and load it into kind.

## 3. Deploy

TODO: apply the k8s/ folder, wait for Postgres, wait for the migration Job to complete,
wait for the API rollout.

## 4. Verify

TODO: list what's running, port-forward to the Service, curl /readyz, /whoami (several
times: which pod answers?) and create + list a kudos.

## 5. Rolling update

TODO: build and load a new tag (e.g. APP_VERSION=1.0.1), switch the Deployment to it,
watch the rollout, and show /whoami reporting the new version.

## 6. Rollback

TODO: show the rollout history, undo, and confirm the old version is back.

## 7. Clean up

TODO: remove everything.

## Troubleshooting

TODO: at least three symptoms you hit (or could hit) and how you diagnosed them.
