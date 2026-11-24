# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev psql redis-cli

install: ## install dependencies
	npm install

up: ## start Postgres (host port 5433) and Redis (host port 6380)
	docker compose up -d --wait

down: ## stop the services
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe the database volume and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the app with reload
	npm run dev

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_22

redis-cli: ## open redis-cli on this module's Redis DB index (22 mod 16 = 6)
	docker compose exec redis redis-cli -n 6
