# Chronicle command map
#
# Windows users: run make from Git Bash or WSL. PowerShell/CMD do not provide
# the POSIX shell features used by recipes such as `test` and `cp`.

.DEFAULT_GOAL := help

DOCKER_COMPOSE ?= docker compose
NPM ?= npm

DESKTOP_DIR := apps/desktop
LANDING_DIR := apps/landing
ENV_FILE := .env

.PHONY: help \
	setup setup-all setup-env setup-desktop setup-landing setup-backend ensure-electron \
	run run-desktop run-all app \
	backend run-backend dev stop restart \
	build build-desktop build-all build-landing build-backend package package-desktop installer \
	typecheck test test-local lint \
	migrate makemigration seed generate-types clean

# --- Setup -----------------------------------------------------------------
setup: setup-desktop

setup-all: setup setup-landing setup-backend

setup-env:
	@test -f "$(ENV_FILE)" || cp .env.example "$(ENV_FILE)"
	@echo "Environment ready: $(ENV_FILE)"

setup-desktop:
	$(NPM) --prefix $(DESKTOP_DIR) ci
	$(NPM) --prefix $(DESKTOP_DIR) run ensure-electron

ensure-electron:
	$(NPM) --prefix $(DESKTOP_DIR) run ensure-electron

setup-landing:
	$(NPM) --prefix $(LANDING_DIR) ci

setup-backend: setup-env
	$(DOCKER_COMPOSE) up --build -d
	$(DOCKER_COMPOSE) run --rm api alembic upgrade head

# --- Run -------------------------------------------------------------------
run: run-desktop

run-desktop: ensure-electron
	$(NPM) --prefix $(DESKTOP_DIR) run dev

run-all: setup-env ensure-electron
	$(DOCKER_COMPOSE) up --build -d
	$(NPM) --prefix $(DESKTOP_DIR) run dev

app: run-desktop

backend run-backend dev: setup-env
	$(DOCKER_COMPOSE) up --build

stop:
	$(DOCKER_COMPOSE) down

restart: stop backend

# --- Build -----------------------------------------------------------------
build: build-desktop

build-desktop:
	$(NPM) --prefix $(DESKTOP_DIR) run build

build-all: build-desktop build-landing build-backend

build-landing:
	$(NPM) --prefix $(LANDING_DIR) run build

build-backend:
	$(DOCKER_COMPOSE) build

package: package-desktop

package-desktop: ensure-electron
	$(NPM) --prefix $(DESKTOP_DIR) run package
	echo "Desktop app packaged in $(DESKTOP_DIR)/dist"

installer: package-desktop

# --- Quality ---------------------------------------------------------------
typecheck:
	$(NPM) --prefix $(DESKTOP_DIR) run typecheck

test:
	$(DOCKER_COMPOSE) run --rm -e TESTING=true api \
		pytest --cov=app --cov-report=term-missing -v

test-local:
	cd services/api && TESTING=true pytest --cov=app --cov-report=term-missing -v --no-header

lint:
	$(DOCKER_COMPOSE) run --rm api ruff check app tests

# --- Database --------------------------------------------------------------
migrate:
	$(DOCKER_COMPOSE) run --rm api alembic upgrade head

MSG ?= migration
makemigration:
	$(DOCKER_COMPOSE) exec api alembic revision --autogenerate -m "$(MSG)"

seed: migrate

# --- Contracts -------------------------------------------------------------
generate-types:
	$(DOCKER_COMPOSE) run --rm api python -c \
		"import json; from app.main import app; print(json.dumps(app.openapi()))" \
		> packages/contracts/api/openapi.yaml
	npx --yes openapi-typescript packages/contracts/api/openapi.yaml \
		-o packages/contracts/api/generated/index.ts

# --- Cleanup ---------------------------------------------------------------
clean:
	$(DOCKER_COMPOSE) down --remove-orphans

# --- Help ------------------------------------------------------------------
help:
	$(info Chronicle commands)
	$(info )
	$(info Desktop MVP:)
	$(info   make setup          Install desktop deps; no Docker required)
	$(info   make run            Run the Chronicle desktop app with hot reload)
	$(info   make build          Build the desktop app)
	$(info   make package        Build a Windows installer .exe)
	$(info   make typecheck      Type-check the desktop app)
	$(info   make ensure-electron Download/repair the Electron binary)
	$(info )
	$(info Everything / optional surfaces:)
	$(info   make setup-all      Setup desktop, landing page, backend, and migrations)
	$(info   make run-all        Run backend in the background, then launch desktop)
	$(info   make build-all      Build desktop, landing page, and backend images)
	$(info )
	$(info Backend control plane:)
	$(info   make setup-backend  Start Docker services and run migrations)
	$(info   make backend        Run Postgres, Redis, OPA, and FastAPI)
	$(info   make dev            Alias for make backend)
	$(info   make stop           Stop Docker services)
	$(info   make migrate        Apply Alembic migrations)
	$(info   make makemigration MSG="...")
	$(info   make generate-types Generate API TypeScript types)
	$(info   make test           Run backend tests in Docker)
	$(info   make lint           Run backend Ruff checks)
	@:
