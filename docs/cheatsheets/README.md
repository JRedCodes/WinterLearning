# 🧾 Cheat sheets

Dense one-pagers to keep open while you work. Each is tailored to this repo: Postgres on **5433**, Redis on **6380**, Kafka on **9092**, `make up` / `make test` / `make down`, one branch per module (`module/NN-slug`), Node 22 + strict TypeScript + Express 5.

| Cheat sheet | Covers | First used in |
|---|---|---|
| [git.md](git.md) | the module branch/PR loop, committing, rebasing, undoing, bisect | [00](../../00-dev-environment/README.md) |
| [docker.md](docker.md) | images vs containers, compose, ports, Dockerfiles, debugging | [00](../../00-dev-environment/README.md), [26](../../26-docker-ci-deploy/README.md) |
| [typescript.md](typescript.md) | tsconfig, NodeNext imports, narrowing, generics, utility types, backend patterns | [02](../../02-typescript-fundamentals/README.md), [08](../../08-typescript-for-backends/README.md) |
| [http.md](http.md) | methods, status codes, headers, curl | [03](../../03-http-fundamentals/README.md), [23](../../23-api-design/README.md) |
| [sql.md](sql.md) | psql, queries, joins, windows, constraints, indexes, EXPLAIN, locking | [11](../../11-sql-fundamentals/README.md)–[16](../../16-checkpoint-postgres/README.md) |
| [redis.md](redis.md) | data structures, TTLs, atomicity, caching/lock patterns, ops | [17](../../17-redis-fundamentals/README.md)–[21](../../21-checkpoint-redis/README.md) |
| [kafka.md](kafka.md) | topics/partitions/groups, CLI tools, kafkajs, delivery semantics | [32](../../32-kafka-fundamentals/README.md), [33](../../33-event-driven-architecture/README.md) |
| [kubectl.md](kubectl.md) | kind, kubectl, manifests, failure states, Helm | [34](../../34-kubernetes-fundamentals/README.md), [35](../../35-kubernetes-in-practice/README.md) |

Looking for a definition rather than a command? See the [glossary](../glossary.md).

Modules also ship topic-specific cheat sheets in their own `docs/` folder (for example [Express 5](../../05-express-basics/docs/express-cheatsheet.md)).
