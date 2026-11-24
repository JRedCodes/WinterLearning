# Same targets in every module: install, up, down, test, reset, dev
.PHONY: install up down test reset dev test-integration produce topics groups

install: ## install dependencies
	npm install

up: ## start Kafka (KRaft, host port 9092) and wait until it's healthy
	docker compose up -d --wait

down: ## stop Kafka
	docker compose down

test: ## run the acceptance tests (in-memory broker; integration tests skip unless KAFKA_BROKERS is set)
	npm test

test-integration: ## run the real-broker tests (needs `make up`)
	KAFKA_BROKERS=$${KAFKA_BROKERS:-localhost:9092} npm run test:integration

reset: ## wipe Kafka's data and reinstall
	docker compose down -v
	rm -rf node_modules dist
	npm install

dev: ## run the projection worker against the local broker
	npm run dev

produce: ## publish a handful of sample order events
	npm run produce

topics: ## list topics on the local broker
	docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

groups: ## show the projection's consumer group (partitions, offsets, lag)
	docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group customer-totals
