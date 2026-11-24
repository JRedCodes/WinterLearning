# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev psql migrate

install: ## install dependencies
	npm install

up: ## start Postgres (host port 5433)
	docker compose up -d --wait

down: ## stop Postgres
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the app with reload
	npm run dev

migrate: ## apply migrations to wl_16
	npm run migrate

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_16
