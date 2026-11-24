# Same targets in every module: install, up, down, test, reset, dev
# The cluster steps (kind, kubectl) are YOUR job: they go in RUNBOOK.md.
.PHONY: install up down test reset dev build image

install: ## install dependencies (also creates package-lock.json, which the Dockerfile needs)
	npm install

up: ## start backing services (none: Postgres runs INSIDE the cluster in this module)
	@echo "no services for this module"

down: ## stop backing services
	@echo "no services for this module"

test: ## validate the manifests, runbook and app contract
	npm test

reset: down ## wipe local state and reinstall
	rm -rf node_modules dist
	npm install

dev: ## run the API locally (readiness stays 503 unless Postgres answers on DB_HOST:DB_PORT)
	npm run dev

build: ## compile TypeScript to dist/
	npm run build

image: ## build the container image (tag must match k8s/ and RUNBOOK.md)
	docker build -t wl-kudos-api:1.0.0 .
