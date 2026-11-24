# Docker build & GitHub Actions cheat sheet

## Docker build and run

```bash
docker build -t wl-26-api:local .                 # build from ./Dockerfile
docker build --target build -t wl-26-build .      # stop at a named stage (debugging)
docker build --no-cache .                         # ignore the layer cache
docker history wl-26-api:local                    # layers and their sizes
docker image inspect wl-26-api:local --format '{{.Config.User}} {{.Config.Cmd}}'
docker images                                     # list images and sizes

docker run --rm -p 3000:3000 -e DATABASE_URL=... wl-26-api:local
docker run --rm -it --entrypoint sh wl-26-api:local   # poke around inside (alpine has sh)
docker ps                                          # includes (healthy)/(unhealthy)
docker inspect --format '{{json .State.Health}}' <container>
docker stop -t 15 <container>                      # SIGTERM, wait 15s, SIGKILL
docker logs -f <container>
```

## Compose

```bash
docker compose up -d --wait postgres     # just one service, wait for healthy
docker compose up --build                # build images, start everything, follow logs
docker compose run --rm migrate          # run a one-off service
docker compose ps                        # status + health
docker compose logs -f api
docker compose stop api                  # graceful (stop_grace_period)
docker compose down                      # stop + remove containers
docker compose down -v                   # ...and volumes (wipes the DB)
docker compose config                    # print the resolved file (validates YAML)
```

`depends_on` conditions: `service_started` (default), `service_healthy`, `service_completed_successfully`.

## GitHub Actions workflow skeleton

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
  workflow_dispatch:            # "Run workflow" button

permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      matrix: { node: [20, 22] }   # one job per value
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5433:5432"]
        options: --health-cmd "pg_isready -U postgres" --health-interval 2s --health-retries 30
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5433/app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node }}", cache: npm }
      - run: npm ci
      - run: npm test

  image:
    needs: test
    if: github.ref == 'refs/heads/main'      # only build/push on main
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## Useful expressions and contexts

| Expression | Value |
|---|---|
| `${{ github.sha }}` | full commit SHA |
| `${{ github.ref }}` | `refs/heads/main`, `refs/pull/12/merge` |
| `${{ github.event_name }}` | `push`, `pull_request`, … |
| `${{ secrets.NAME }}` | encrypted secret (masked in logs) |
| `${{ vars.NAME }}` | non-secret config variable |
| `${{ matrix.node }}` | current matrix value |
| `${{ needs.test.outputs.x }}` | output from another job |
| `if: failure()` / `if: always()` | run a step on failure / always |

## Gotchas

- Jobs run on **separate machines**. Files don't carry over unless you use artifacts (`actions/upload-artifact`) or rebuild.
- Service containers are reachable on `localhost:<host port>` when the job runs directly on the runner, and by service name when the job itself runs in a `container:`.
- Secrets are **not** passed to workflows triggered by PRs from forks.
- YAML: `on:` is a string key in Actions' parser. Quote values that look like numbers or booleans when in doubt (`node-version: "22"`).
- Pin actions (`@v4`) at least, and a full commit SHA for third-party actions in security-sensitive repos.
