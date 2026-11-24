# Same targets in every module: install, up, down, test, reset, dev
# Cluster steps live in RUNBOOK.md (they need Docker, kind, kubectl and helm on your machine).
.PHONY: install up down test reset dev build image lint-chart template

install: ## install dependencies (also creates package-lock.json, which the Dockerfile needs)
	npm install

up: ## start backing services (none: everything runs in your kind cluster)
	@echo "no services for this module"

down: ## stop backing services
	@echo "no services for this module"

test: ## validate the fixed manifests, the HPA/PDB and the Helm chart
	npm test

reset: down ## wipe local state and reinstall
	rm -rf node_modules dist
	npm install

dev: ## run the API locally (readiness stays 503 unless Postgres answers on DB_HOST:DB_PORT)
	npm run dev

build: ## compile TypeScript to dist/
	npm run build

image: ## build the container image used by broken/ and the chart
	docker build -t wl-kudos-api:1.0.0 .

lint-chart: ## needs helm: static checks on the chart
	helm lint ./chart

template: ## needs helm: render the chart locally, no cluster required
	helm template kudos-api ./chart --namespace kudos-helm
