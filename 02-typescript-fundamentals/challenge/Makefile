# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev typecheck

install: ## install dependencies
	npm install

up: ## start backing services (none for this module)
	@echo "no services for this module"

down: ## stop backing services
	@echo "no services for this module"

test: ## run the acceptance tests (includes a full type check)
	npm test

typecheck: ## run only the compiler
	npm run typecheck

reset: down ## wipe local state and reinstall
	rm -rf node_modules dist
	npm install

dev: ## re-run src/playground.ts on every save
	npm run dev
