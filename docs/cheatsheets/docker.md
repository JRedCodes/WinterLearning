# Docker & Compose cheat sheet

> Images, containers, compose and the debugging moves you'll actually need. Taught in [00 · Dev Environment](../../00-dev-environment/README.md) and [26 · Docker, CI & Deployment](../../26-docker-ci-deploy/README.md).

## Mental model

| Thing | What it is |
|---|---|
| **Image** | A read-only, layered filesystem + metadata (the recipe's result). `postgres:16-alpine` |
| **Container** | A running (or stopped) process started from an image, with its own writable layer |
| **Volume** | Storage managed by Docker that survives container removal (`pgdata`) |
| **Port mapping** | `HOST:CONTAINER`. `5433:5432` = your laptop's 5433 forwards to Postgres's 5432 inside |
| **Network** | Compose puts all services on one network; they reach each other **by service name** |

## This repo's conventions

| Service | Image | Host port | Inside the compose network |
|---|---|---|---|
| Postgres | `postgres:16-alpine` | **5433** | `postgres:5432` |
| Redis | `redis:7-alpine` | **6380** | `redis:6379` |
| Kafka | `apache/kafka:3.9.0` (KRaft) | **9092** | `kafka:9092` |

From your app on the host: `postgres://postgres:postgres@localhost:5433/wl_NN`, `redis://localhost:6380/<NN mod 16>`, `localhost:9092`.
From another container in the same compose file: use the service name and the **container** port (`postgres:5432`).

```bash
make up      # docker compose up -d --wait   (waits for healthchecks)
make test
make down    # docker compose down           (keeps volumes)
make reset   # docker compose down -v + reinstall (wipes data)
```

## Compose commands

```bash
docker compose up -d --wait          # start in background, block until healthy
docker compose ps                    # status + health of each service
docker compose logs -f postgres      # follow one service's logs
docker compose logs --tail=50        # last lines from all services
docker compose exec postgres psql -U postgres -d wl_13   # shell into a running service
docker compose exec redis redis-cli -n 1
docker compose run --rm migrate      # run a one-off service and remove it
docker compose restart redis
docker compose down                  # stop + remove containers and network
docker compose down -v               # ...and named volumes (data is gone)
docker compose config                # print the fully-resolved file (great for debugging)
docker compose pull                  # fetch newer images
```

## Minimal compose file (Postgres + Redis)

```yaml
name: wl-13
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: wl }
    ports: ["5433:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 20
  redis:
    image: redis:7-alpine
    ports: ["6380:6379"]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 2s, retries: 20 }
  api:
    build: .
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/wl   # service name, container port
    depends_on:
      postgres: { condition: service_healthy }                      # wait for healthcheck, not just "started"
volumes:
  pgdata:
```

## Images & containers (plain docker)

```bash
docker build -t wl-api:dev .                 # build from ./Dockerfile
docker build --target build -t wl-api:build . # stop at a named stage
docker images                                # list local images
docker run --rm -p 3000:3000 --env-file .env wl-api:dev
docker run --rm -it node:22-alpine sh        # throwaway shell in an image
docker ps                                    # running containers (-a for all)
docker logs -f <container>
docker exec -it <container> sh               # shell into a running container
docker inspect <container>                   # full JSON: env, mounts, IP, health
docker stats                                 # live CPU / memory
docker stop <c> && docker rm <c>
docker system df                             # disk used by images/volumes/cache
docker system prune                          # remove stopped containers, dangling images (add -a --volumes to go nuclear)
```

## Production-style Dockerfile (Node 22 + TS)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                               # deps layer is cached until package files change
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node                                # never run as root
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]           # exec form: node is PID 1 and receives SIGTERM
```

`.dockerignore`:

```
node_modules
dist
.git
.env
*.log
coverage
```

## Debugging checklist

| Symptom | Likely cause / fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:5433` | Services not up: `make up`, then `docker compose ps` |
| `port is already allocated` | Something else uses the host port. `lsof -i :5433`, or stop the other container |
| App container can't reach `localhost:5432` | Inside a container `localhost` is the container itself. Use `postgres:5432` |
| `password authentication failed` | Volume was created with old credentials. `make reset` (wipes data) |
| Service "started" but app fails on boot | Use `depends_on: condition: service_healthy` + a healthcheck |
| Container exits immediately | `docker compose logs <svc>`; check the CMD and env vars |
| Rebuilds reinstall all deps every time | `COPY . .` before `npm ci` busts the cache. Copy package files first |
| Ctrl+C / `docker stop` takes 10s | Process isn't handling SIGTERM, or shell-form CMD makes `sh` PID 1 |

## Gotchas

- `docker compose down -v` deletes your database. `down` alone keeps it.
- Changing `POSTGRES_PASSWORD` has no effect on an existing volume; the init only runs on an empty data dir.
- `latest` tags drift. Pin versions (`postgres:16-alpine`) for reproducible setups.
- `docker-compose` (v1, hyphen) is legacy; use `docker compose` (v2 plugin).
- Apple Silicon: some images are amd64-only. Prefer multi-arch official images.
- Don't bake secrets into images (`ENV API_KEY=...`). Anyone with the image can read them.
