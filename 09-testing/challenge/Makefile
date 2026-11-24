# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev mutants psql

install: ## install dependencies
	npm install

up: ## start Postgres (port 5433) and wait until it's healthy
	docker compose up -d --wait

down: ## stop backing services
	docker compose down

test: ## run your tests + the mutation check (grading)
	npm test

mutants: ## run only the mutation check, with a detailed report
	npm run mutants

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API with reload (needs `make up`)
	npm run dev

psql: ## open a psql shell on this module's database
	docker compose exec postgres psql -U postgres -d wl_09
