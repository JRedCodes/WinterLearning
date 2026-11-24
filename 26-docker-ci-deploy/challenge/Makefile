# Same targets in every module: install, up, down, test, reset, dev
# (plus a few extras for this module: build, lint, migrate, image, stack, stack-down, psql)
.PHONY: install up down test reset dev build lint migrate image stack stack-down psql

install: ## install dependencies
	npm install

up: ## start ONLY Postgres (host port 5433) for local dev and tests
	docker compose up -d --wait postgres

down: ## stop everything this compose file started
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the app with reload (needs `make up` and `make migrate`)
	npm run dev

build: ## compile TypeScript to dist/
	npm run build

lint: ## run the tiny architecture linter
	npm run lint

migrate: ## apply migrations to wl_26 from your machine
	npm run migrate

image: ## build the production image (needs a package-lock.json: run `npm install` first)
	docker build -t wl-26-api:local .

stack: ## run the prod-like stack: postgres -> migrate -> api
	docker compose up --build

stack-down: ## stop the prod-like stack
	docker compose down

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_26
