# ─────────────────────────────────────────────────────────────────────
# Windows users: GNU make must be run from Git Bash or WSL.
#   Git Bash:  comes with Git for Windows — open "Git Bash" terminal
#   WSL:       wsl make <target>
#   Chocolatey install: choco install make  (then use Git Bash shell)
# ─────────────────────────────────────────────────────────────────────

.PHONY: dev stop build migrate makemigration seed generate-types test test-local lint

# ── Docker ────────────────────────────────────────────────────────────
dev:
	docker compose up --build -d

stop:
	docker compose down

build:
	docker compose build

# ── Database ──────────────────────────────────────────────────────────
migrate:
	docker compose run --rm api alembic upgrade head

# Usage: make makemigration MSG="add payments table"
# Requires: dev stack running (make dev), because exec needs a live container
# and the volume mount (docker-compose.override.yml) is what writes the file locally.
MSG ?= migration
makemigration:
	docker compose exec api alembic revision --autogenerate -m "$(MSG)"

seed:
	docker compose run --rm api alembic upgrade head

# ── Contracts ─────────────────────────────────────────────────────────
generate-types:
	docker compose run --rm api python -c \
		"import json; from app.main import app; print(json.dumps(app.openapi()))" \
		> packages/contracts/api/openapi.yaml
	npx openapi-typescript packages/contracts/api/openapi.yaml \
		-o packages/contracts/api/generated/index.ts

# ── Tests ─────────────────────────────────────────────────────────────
test:
	docker compose run --rm -e TESTING=true api \
		pytest --cov=app --cov-report=term-missing -v

# Runs pytest directly (no Docker). Requires: cd services/api && pip install -e ".[dev]"
test-local:
	cd services/api && TESTING=true pytest --cov=app --cov-report=term-missing -v --no-header

# ── Lint ──────────────────────────────────────────────────────────────
lint:
	docker compose run --rm api ruff check app tests

# ── Help ──────────────────────────────────────────────────────────────
help:
	@echo "Available targets:"
	@echo "  dev              Start the development environment (Docker)"
	@echo "  stop             Stop the development environment (Docker)"
	@echo "  build            Build Docker images"
	@echo "  migrate          Apply database migrations"
	@echo "  makemigration    Create a new database migration (set MSG=\"description\")"
	@echo "  seed             Apply migrations that include initial seed data"
	@echo "  generate-types   Generate TypeScript types from OpenAPI spec"
	@echo "  test             Run tests with coverage (Docker)"
	@echo "  test-local       Run tests with coverage (local environment)"
	@echo "  lint             Run code linting (Docker)"
