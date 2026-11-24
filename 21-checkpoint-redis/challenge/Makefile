# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev psql redis-cli

install: ## install dependencies
	npm install

up: ## start Postgres (5433) and Redis (6380) and wait until healthy
	docker compose up -d --wait

down: ## stop services
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe Postgres/Redis data and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API + worker with reload
	npm run dev

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_21

redis-cli: ## open redis-cli on this module's database (index 5)
	docker compose exec redis redis-cli -n 5
