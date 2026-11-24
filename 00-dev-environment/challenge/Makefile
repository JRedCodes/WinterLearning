# Makefile for module 00. `make <target>` runs the recipe under that target.
# Recipe lines MUST start with a TAB character, not spaces.
.PHONY: install test dev

install: ## install dependencies
	npm install

test: ## run the acceptance tests
	npm test

dev: ## run the service check once
	npm run check

# TODO(2): add these targets (and list every target in .PHONY):
#   up         start postgres + redis in the background and WAIT until they are healthy
#   down       stop and remove the containers (keep the data volume)
#   reset      remove containers AND volumes, then reinstall node_modules from scratch
#   logs       follow the logs of all services
#   psql       open a psql shell inside the postgres container (user postgres, db wl_00)
#   redis-cli  open redis-cli inside the redis container
