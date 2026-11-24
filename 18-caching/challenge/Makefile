# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev db-setup psql redis-cli

install: ## install dependencies
	npm install

up: ## start Postgres (5433) + Redis (6380) and wait until healthy
	docker compose up -d --wait

down: ## stop services
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe all data volumes and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API with reload (run `make db-setup` once first)
	npm run dev

db-setup: ## create the wl_18 database, run migrations, seed demo products
	npm run db:setup

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_18

redis-cli: ## open redis-cli on this module's database (index 2)
	docker compose exec redis redis-cli -n 2
