# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev

install: ## install dependencies
	npm install

up: ## start backing services (none for this module)
	@echo "no services for this module"

down: ## stop backing services
	@echo "no services for this module"

test: ## lint-check the design write-ups (headings, diagrams, minimum depth)
	npm test

reset: down ## wipe local state and reinstall
	rm -rf node_modules dist
	npm install

dev: ## re-run the checks on every save while you write
	npm run test:watch
