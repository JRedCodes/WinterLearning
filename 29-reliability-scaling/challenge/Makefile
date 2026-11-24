# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev load

install: ## install dependencies
	npm install

up: ## start backing services (none for this module)
	@echo "no services for this module"

down: ## stop backing services
	@echo "no services for this module"

test: ## run the acceptance tests
	npm test

reset: down ## wipe local state and reinstall
	rm -rf node_modules dist
	npm install

dev: ## run the aggregator with simulated flaky downstreams
	npm run dev

load: ## optional: run the k6 load test against localhost:3000 (needs k6 installed)
	k6 run k6/load.js
