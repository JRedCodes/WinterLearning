# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev migrate psql redis-cli

install: ## install dependencies
	npm install

up: ## start Postgres (5433) and Redis (6380)
	docker compose up -d --wait

down: ## stop the services
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe volumes and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the app with reload (needs `make up` and `make migrate`)
	npm run dev

migrate: ## apply migrations to wl_31
	npm run migrate

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_31

redis-cli: ## open redis-cli on this module's DB index (15)
	docker compose exec redis redis-cli -n 15
