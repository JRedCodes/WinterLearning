# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev migrate db-reset psql

install: ## install dependencies
	npm install

up: ## start Postgres (host port 5433)
	docker compose up -d --wait

down: ## stop Postgres
	docker compose down

test: ## run the acceptance tests (each test file rebuilds the schema from your migrations)
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## (no app in this module) drop everything and re-apply all migrations, then explore with `make psql`
	npm run db:reset

migrate: ## apply pending migrations to wl_12
	npm run migrate

db-reset: ## drop the public schema and re-apply every migration from scratch
	npm run db:reset

psql: ## open psql on the module database
	docker compose exec postgres psql -U postgres -d wl_12
