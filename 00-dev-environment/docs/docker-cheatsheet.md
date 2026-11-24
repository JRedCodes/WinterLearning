# Docker & Compose cheat sheet

## Mental model

```
image  (read-only template, e.g. postgres:16-alpine)
  └── container  (running instance + thin writable layer, discarded on removal)
        ├── ports    HOST:CONTAINER   "5433:5432"
        ├── volumes  named volume or bind mount → data that outlives the container
        └── network  services reach each other by service name
```

## Compose (what you'll use 95% of the time)

```bash
docker compose up -d --wait        # start in background, block until healthy
docker compose ps                  # status + health
docker compose logs -f [service]   # follow logs
docker compose exec postgres psql -U postgres -d wl_00
docker compose exec redis redis-cli
docker compose restart redis
docker compose stop                # stop, keep containers
docker compose down                # remove containers + network, KEEP volumes
docker compose down -v             # ...and delete volumes (data gone)
docker compose config              # print the fully resolved file (great for debugging)
docker compose pull                # fetch newer images for the same tags
```

## Plain Docker

```bash
docker ps                          # running containers (-a for all)
docker images                      # local images
docker run --rm -it alpine sh      # throwaway interactive container
docker run -d --name r -p 6380:6379 redis:7-alpine
docker logs -f r
docker exec -it r sh               # shell inside a running container
docker inspect r                   # everything: env, mounts, IPs, health
docker stop r && docker rm r
docker volume ls / docker volume rm <name>
docker system df                   # disk usage
docker system prune                # remove stopped containers, dangling images (asks first)
```

## Compose file skeleton

```yaml
name: my-project
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    ports: ["5433:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      timeout: 3s
      retries: 20
  api:
    build: .
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/app   # service name + CONTAINER port
    depends_on:
      postgres: { condition: service_healthy }
volumes:
  pgdata:
```

## Healthcheck `test` forms

| Form | Runs |
|---|---|
| `["CMD", "redis-cli", "ping"]` | the binary directly, no shell |
| `["CMD-SHELL", "pg_isready -U postgres"]` | via `/bin/sh -c` (pipes, `&&`, env vars work) |
| `"pg_isready -U postgres"` | string = same as CMD-SHELL |

Exit 0 = healthy. `retries` consecutive failures = unhealthy. `start_period` gives slow starters a grace period.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `port is already allocated` | Something else uses the host port: `lsof -i :5433`, or another project's container (`docker ps`) |
| `ECONNREFUSED` right after `up` | Not ready yet; use `--wait` + healthchecks |
| App in a container can't reach `localhost:5432` | Inside a container, use the service name (`postgres:5432`) |
| Changed `POSTGRES_PASSWORD`, still old password | Init env only applies to an EMPTY data dir. `docker compose down -v` to reinitialize |
| `Cannot connect to the Docker daemon` | Docker Desktop / dockerd isn't running |
| Disk full | `docker system df`, then `docker system prune` (and `--volumes` if you're sure) |
| Container exits immediately | `docker compose logs <service>`; check the command/env |
