# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev fake-payments

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

dev: ## run the app with reload (start `make fake-payments` in another terminal first)
	npm run dev

fake-payments: ## run a tiny fake payments service on :4001 for manual testing
	npx tsx scripts/fakePayments.ts
