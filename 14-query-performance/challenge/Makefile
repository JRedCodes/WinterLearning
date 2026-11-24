# Same targets in every module: install, up, down, test, reset, dev (+ psql, seed here)
.PHONY: install up down test reset dev psql seed

install: ## install dependencies
	npm install

up: ## start Postgres (port 5433) and wait until it's healthy
	docker compose up -d --wait
	docker compose exec postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'wl_14'" | grep -q 1 \
	  || docker compose exec postgres psql -U postgres -c "CREATE DATABASE wl_14"

down: ## stop Postgres (data is kept in the named volume)
	docker compose down

test: ## run the acceptance tests (reseeds the database first)
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API with reload (run `make seed` once first)
	npm run dev

psql: ## open a psql shell on the module database (try EXPLAIN ANALYZE here!)
	docker compose exec postgres psql -U postgres -d wl_14

seed: ## recreate the schema, apply migrations and load the seed data
	npm run seed
