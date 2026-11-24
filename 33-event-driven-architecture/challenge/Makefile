# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev test-integration migrate psql topics dlq

install: ## install dependencies
	npm install

up: ## start Postgres (5433) and Kafka (9092), wait until healthy
	docker compose up -d --wait

down: ## stop the services
	docker compose down

test: ## run the acceptance tests (needs Postgres; Kafka tests skip unless KAFKA_BROKERS is set)
	npm test

test-integration: ## run the real-broker tests (needs `make up`)
	KAFKA_BROKERS=$${KAFKA_BROKERS:-localhost:9092} npm run test:integration

reset: ## wipe all data and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the API + outbox relay + payments consumer with reload
	npm run dev

migrate: ## apply migrations to wl_33
	npm run migrate

psql: ## open psql on this module's database
	docker compose exec postgres psql -U postgres -d wl_33

topics: ## list Kafka topics
	docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

dlq: ## print everything in the payments dead-letter topic (with headers)
	docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
	  --topic orders.v1.payments-dlq --from-beginning --timeout-ms 5000 \
	  --property print.key=true --property print.headers=true
