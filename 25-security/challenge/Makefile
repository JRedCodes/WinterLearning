# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev seed psql audit

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

dev: ## run the app with reload (run `make seed` once first)
	npm run dev

seed: ## create tables and demo users/tokens in wl_25
	npm run seed

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_25

audit: ## check dependencies for known vulnerabilities
	npm audit --omit=dev
