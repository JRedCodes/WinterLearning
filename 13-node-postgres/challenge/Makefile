# Same targets in every module: install, up, down, test, reset, dev (+ psql, migrate here)
.PHONY: install up down test reset dev psql migrate

install: ## install dependencies
	npm install

up: ## start Postgres (port 5433) and wait until it's healthy
	docker compose up -d --wait
	docker compose exec postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'wl_13'" | grep -q 1 \
	  || docker compose exec postgres psql -U postgres -c "CREATE DATABASE wl_13"

down: ## stop Postgres (data is kept in the named volume)
	docker compose down

test: ## run the acceptance tests
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API with reload (runs migrations at startup once TODO 6 is done)
	npm run dev

psql: ## open a psql shell on the module database
	docker compose exec postgres psql -U postgres -d wl_13

migrate: ## apply pending migrations without starting the server
	npm run migrate
