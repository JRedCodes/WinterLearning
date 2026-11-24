# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev worker migrate psql redis-cli kafka-topics

install: ## install dependencies
	npm install

up: ## start Postgres (5433), Redis (6380) and Kafka (9092)
	docker compose up -d --wait

down: ## stop backing services
	docker compose down

test: ## run the acceptance tests (needs Postgres + Redis; Kafka tests are skipped unless KAFKA_BROKERS is set)
	npm test

reset: ## wipe volumes and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API with reload
	npm run dev

worker: ## run the background worker (outbox relay, hold sweeper, notifications)
	npm run worker

migrate: ## apply migrations to wl_36
	npm run migrate

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_36

redis-cli: ## open redis-cli on db 4
	docker compose exec redis redis-cli -n 4

kafka-topics: ## list Kafka topics
	docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
