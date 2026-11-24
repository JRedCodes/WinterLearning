# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev redis-cli token

install: ## install dependencies
	npm install

up: ## start Redis (host port 6380) and wait until it is healthy
	docker compose up -d --wait

down: ## stop Redis
	docker compose down

test: ## run the acceptance tests (needs `make up`)
	npm test

reset: ## wipe Redis data and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run one chat instance with reload (PORT=3001 make dev for a second one)
	npm run dev

redis-cli: ## open redis-cli on this module's database (index 12)
	docker compose exec redis redis-cli -n 12

token: ## print a connection token: make token USER=alice
	npm run -s token -- $(or $(USER),alice)
