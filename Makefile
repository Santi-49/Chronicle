# Chronicle command map
#
# Windows users: run make from Git Bash or WSL. PowerShell/CMD do not provide
# the POSIX shell features used by recipes such as `test` and `cp`.

.DEFAULT_GOAL := help

DOCKER_COMPOSE ?= docker compose
NPM ?= npm
PYTHON ?= python

DESKTOP_DIR := apps/desktop
LANDING_DIR := apps/landing
AI_DIR := services/ai
ENV_FILE := .env

.PHONY: help \
	setup setup-all setup-env setup-desktop setup-landing setup-backend setup-ai ensure-electron \
	run run-desktop run-all run-ai app ai \
	backend run-backend dev stop restart \
	build build-desktop build-all build-landing build-backend package package-desktop installer \
	typecheck test test-local test-ai smoke-ai lint \
	migrate makemigration seed generate-types generate-ai-types clean \
	demo-assets demo-reset demo-set demo-next demo-status demo-clean

# --- Setup -----------------------------------------------------------------
# demo-reset (not demo-assets) so setup needs no Pillow: sources are committed,
# this just copies v1 of each into the git-ignored workspace/.
setup: setup-desktop demo-reset

setup-all: setup setup-landing setup-backend setup-ai

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

# Local AI service (services/ai): dev tools + the default demo provider (Gemini).
# Add other providers with, e.g., pip install -e "services/ai[anthropic]".
setup-ai:
	$(PYTHON) -m pip install -e "$(AI_DIR)[dev,google]"

setup-backend: setup-env
	$(DOCKER_COMPOSE) up --build -d
	$(DOCKER_COMPOSE) run --rm api alembic upgrade head

# --- Run -------------------------------------------------------------------
run: run-desktop

run-desktop: ensure-electron
	$(NPM) --prefix $(DESKTOP_DIR) run dev

run-landing:
	$(NPM) --prefix $(LANDING_DIR) run dev

run-all: setup-env ensure-electron
	$(DOCKER_COMPOSE) up --build -d
	$(NPM) --prefix $(DESKTOP_DIR) run dev

app: run-desktop

# Run the local AI service (loopback-only FastAPI sidecar). Electron also starts
# it automatically; this target is for developing the service on its own.
run-ai:
	cd $(AI_DIR) && $(PYTHON) -m uvicorn chronicle_ai.main:app --host 127.0.0.1 --port 8765

ai: run-ai

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

# Provider-mocked AI service tests (no network, no API key required).
test-ai:
	cd $(AI_DIR) && $(PYTHON) -m pytest

# Live manual smoke test of the annotation pipeline. Needs a real key + provider
# in .env (see .env.example) and the provider package installed (make setup-ai).
# Override images with ARGS, e.g. make smoke-ai ARGS="before.png after.png".
smoke-ai:
	$(PYTHON) $(AI_DIR)/tests/manual_smoke.py $(ARGS)

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

# Regenerate the C3 AI client types from the AI service's OpenAPI schema.
generate-ai-types:
	$(NPM) --prefix $(DESKTOP_DIR) run generate-ai-types

# --- Demo assets -----------------------------------------------------------
# A git-ignored pack of creative files for exercising capture + AI diffs.
# sources/ holds untouched version variants; workspace/ is what you point
# Chronicle at. See scripts/demo_assets.py for the full story.
DEMO := $(PYTHON) scripts/demo_assets.py
ASSET ?=
V ?=

demo-assets:
	$(DEMO) generate

demo-reset:
	$(DEMO) reset

# Put a specific version in the workspace: make demo-set ASSET=logo V=3
demo-set:
	$(DEMO) set $(ASSET) $(V)

# Advance one asset (ASSET=logo) or all assets to the next version, wrapping.
demo-next:
	$(DEMO) next $(ASSET)

demo-status:
	$(DEMO) status

demo-clean:
	$(DEMO) clean

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
	$(info Local AI service (services/ai, required for AI features):)
	$(info   make setup-ai       Install the AI service + Gemini demo provider)
	$(info   make run-ai         Run the loopback AI service on 127.0.0.1:8765)
	$(info   make test-ai        Run provider-mocked AI service tests)
	$(info   make smoke-ai       Live smoke test the annotation pipeline (needs a real key))
	$(info   make generate-ai-types Regenerate the C3 AI client types)
	$(info )
	$(info Demo assets (git-ignored creative files for testing capture + AI):)
	$(info   make demo-assets    Generate the source versions + reset workspace to v1)
	$(info   make demo-status    Show the current workspace version of each asset)
	$(info   make demo-next ASSET=logo   Swap in the next version (omit ASSET for all))
	$(info   make demo-set ASSET=logo V=3   Put a specific version in the workspace)
	$(info   make demo-reset     Reset every workspace file back to v1)
	$(info   make demo-clean     Delete the demo-assets/ folder)
	$(info )
	$(info Landing page (apps/landing):)
	$(info   make setup-landing  Install landing page deps)
	$(info   make build-landing  Build the landing page)
	$(info   make run-landing    Run the landing page dev server)
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
