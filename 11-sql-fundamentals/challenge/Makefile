# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev seed psql

install: ## install dependencies
	npm install

up: ## start Postgres (host port 5433)
	docker compose up -d --wait

down: ## stop Postgres
	docker compose down

test: ## run the acceptance tests (reloads the dataset first)
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## (no app in this module) load the dataset so you can explore it in psql
	npm run seed

seed: ## (re)load sql/schema.sql + sql/seed.sql into wl_11
	npm run seed

psql: ## open psql on the module database
	docker compose exec postgres psql -U postgres -d wl_11
