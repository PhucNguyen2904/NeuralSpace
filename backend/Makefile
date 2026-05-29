SHELL := /bin/sh

.PHONY: dev test test-int migrate lint build train promote rollback data-validate

dev:
	docker compose up --build

test:
	pytest -q tests

test-int:
	pytest -q tests/integration -m integration

migrate:
	alembic upgrade head

lint:
	ruff check app tests && mypy app

build:
	docker compose build

data-validate:
	python scripts/data_validation.py --input data/dataset.csv --schema-config scripts/schema_config.json --output validation_report.json

train:
	@if [ -z "$(DATASET_VERSION)" ]; then echo "Usage: make train DATASET_VERSION=v1.2"; exit 1; fi
	PLATFORM_DATASET_VERSION_ID=$(DATASET_VERSION) python scripts/train.py --dataset-version-id $(DATASET_VERSION) --output run_output.json

promote:
	@if [ -z "$(MODEL)" ] || [ -z "$(VERSION)" ] || [ -z "$(STAGE)" ]; then echo "Usage: make promote MODEL=resnet50 VERSION=3 STAGE=staging"; exit 1; fi
	curl -sS -X POST \
	  -H "Authorization: Bearer $$PLATFORM_API_TOKEN" \
	  -H "Content-Type: application/json" \
	  "$$PLATFORM_API_BASE_URL/api/v1/models/$(MODEL)/versions/$(VERSION)/promote" \
	  -d "{\"target_stage\":\"$$(echo $(STAGE) | awk '{print toupper(substr($$0,1,1)) tolower(substr($$0,2))}')\",\"reason\":\"Manual promote via Makefile\",\"notify_team\":true}"

rollback:
	@if [ -z "$(MODEL)" ]; then echo "Usage: make rollback MODEL=resnet50 VERSION=<optional>"; exit 1; fi
	@if [ -z "$(VERSION)" ]; then echo "VERSION is required for rollback endpoint"; exit 1; fi
	curl -sS -X POST \
	  -H "Authorization: Bearer $$PLATFORM_API_TOKEN" \
	  -H "Content-Type: application/json" \
	  "$$PLATFORM_API_BASE_URL/api/v1/models/$(MODEL)/versions/$(VERSION)/rollback" \
	  -d '{"reason":"Manual rollback via Makefile"}'
