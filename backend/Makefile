SHELL := /bin/sh

.PHONY: dev test test-int migrate lint build

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
