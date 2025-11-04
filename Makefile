# SFPLiberate Makefile
# Streamlined build and deployment commands

.PHONY: help build dev prod test clean logs shell restart health status deploy

# Default target
.DEFAULT_GOAL := help

# Colors for output
BOLD := \033[1m
RESET := \033[0m
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m

# Project metadata
PROJECT_NAME := sfpliberate
COMPOSE_FILE := docker-compose.yml
COMPOSE_DEV := docker-compose.dev.yml
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Optional ESPHome overrides
ESPHOME_PROXY_MODE_LOWER := $(shell printf '%s' "$(ESPHOME_PROXY_MODE)" | tr '[:upper:]' '[:lower:]')
ifeq ($(filter true 1 yes,$(ESPHOME_PROXY_MODE_LOWER)),)
COMPOSE_STACK := -f $(COMPOSE_FILE)
DEV_COMPOSE_STACK := -f $(COMPOSE_FILE) -f $(COMPOSE_DEV)
else
COMPOSE_STACK := -f $(COMPOSE_FILE) -f docker-compose.esphome.yml
DEV_COMPOSE_STACK := -f $(COMPOSE_FILE) -f $(COMPOSE_DEV) -f docker-compose.esphome.yml
endif

# Export variables for docker-compose
export VERSION
export BUILD_DATE
export VCS_REF

##@ General

help: ## Display this help message
	@echo "$(BOLD)SFPLiberate - Build & Deployment Commands$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make $(BLUE)<target>$(RESET)\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(BLUE)%-15s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

dev: ## Start development environment with hot-reload
	@echo "$(GREEN)Starting development environment...$(RESET)"
	docker-compose $(DEV_COMPOSE_STACK) up --build

dev-detached: ## Start development environment in background
	@echo "$(GREEN)Starting development environment (detached)...$(RESET)"
	docker-compose $(DEV_COMPOSE_STACK) up -d --build

dev-logs: ## Follow logs in development mode
	docker-compose $(DEV_COMPOSE_STACK) logs -f

dev-stop: ## Stop development environment
	docker-compose $(DEV_COMPOSE_STACK) down --volumes --remove-orphans

##@ Production

build: ## Build production images
	@echo "$(GREEN)Building production images...$(RESET)"
	@echo "Version: $(VERSION)"
	@echo "Build Date: $(BUILD_DATE)"
	@echo "VCS Ref: $(VCS_REF)"
	docker-compose $(COMPOSE_STACK) build --parallel

prod: build ## Start production environment
	@echo "$(GREEN)Starting production environment...$(RESET)"
	docker-compose $(COMPOSE_STACK) up -d
	@echo "$(GREEN)Waiting for services to be healthy...$(RESET)"
	@sleep 5
	@$(MAKE) health

up: prod ## Alias for 'make prod'

restart: ## Restart all services
	@echo "$(YELLOW)Restarting services...$(RESET)"
	docker-compose $(COMPOSE_STACK) restart
	@$(MAKE) health

stop: ## Stop all services
	@echo "$(YELLOW)Stopping services...$(RESET)"
	docker-compose $(COMPOSE_STACK) stop

down: ## Stop and remove containers
	@echo "$(YELLOW)Stopping and removing containers...$(RESET)"
	docker-compose $(COMPOSE_STACK) down

prod-stop: ## Stop production services without removing containers
	@echo "$(YELLOW)Stopping production services...$(RESET)"
	docker-compose $(COMPOSE_STACK) stop

prod-clean: ## Stop production services and remove containers + volumes
	@echo "$(YELLOW)Stopping services and removing containers/volumes...$(RESET)"
	docker-compose $(COMPOSE_STACK) down --volumes --remove-orphans

prune-build-cache: ## Remove unused Docker builder cache (safe)
	@echo "$(YELLOW)Pruning Docker build cache...$(RESET)"
	docker builder prune -f

down-volumes: ## Stop and remove containers + volumes (⚠️  destroys data)
	@echo "$(YELLOW)⚠️  WARNING: This will delete all data!$(RESET)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose $(COMPOSE_STACK) down -v --remove-orphans; \
	fi

##@ Monitoring

logs: ## Follow logs for all services
	docker-compose $(COMPOSE_STACK) logs -f

logs-backend: ## Follow backend logs only
	docker-compose $(COMPOSE_STACK) logs -f backend

logs-frontend: ## Follow frontend logs only
	docker-compose $(COMPOSE_STACK) logs -f frontend

health: ## Check service health status
	@echo "$(BLUE)Checking service health...$(RESET)"
	@docker-compose $(COMPOSE_STACK) ps
	@echo ""
	@echo "$(BLUE)Backend Health:$(RESET)"
	@curl -f http://localhost:${BACKEND_HOST_PORT:-8081}/api/modules > /dev/null 2>&1 && echo "$(GREEN)✓ Backend is healthy$(RESET)" || echo "$(YELLOW)✗ Backend is unhealthy$(RESET)"
	@echo ""
	@echo "$(BLUE)Frontend Health:$(RESET)"
	@curl -f http://localhost:${FRONTEND_PORT:-3000}/ > /dev/null 2>&1 && echo "$(GREEN)✓ Frontend is healthy$(RESET)" || echo "$(YELLOW)✗ Frontend is unhealthy$(RESET)"

status: health ## Alias for 'make health'

##@ Testing

test: ## Run all tests
	@echo "$(GREEN)Running backend tests...$(RESET)"
	@$(MAKE) test-backend
	@echo ""
	@echo "$(GREEN)Running frontend tests...$(RESET)"
	@$(MAKE) test-frontend

test-backend: ## Run backend tests
	cd backend && poetry run pytest --cov --cov-report=term-missing

test-frontend: ## Run frontend tests (type-check + lint)
	cd frontend && npm run type-check && npm run lint

lint: ## Run linters
	@echo "$(GREEN)Linting backend...$(RESET)"
	cd backend && poetry run ruff check app tests
	@echo ""
	@echo "$(GREEN)Linting frontend...$(RESET)"
	cd frontend && npm run lint

lint-fix: ## Fix linting issues
	@echo "$(GREEN)Fixing backend linting...$(RESET)"
	cd backend && poetry run ruff check --fix app tests
	@echo ""
	@echo "$(GREEN)Fixing frontend linting...$(RESET)"
	cd frontend && npm run lint:fix

format: ## Format code
	cd frontend && npm run format

##@ Database

db-migrate: ## Run database migrations
	docker-compose exec backend alembic upgrade head

db-rollback: ## Rollback last migration
	docker-compose exec backend alembic downgrade -1

db-shell: ## Open SQLite shell
	docker-compose exec backend sqlite3 /app/data/sfp_library.db

db-backup: ## Backup database
	@mkdir -p backups
	@docker-compose exec -T backend cat /app/data/sfp_library.db > backups/sfp_library_$(shell date +%Y%m%d_%H%M%S).db
	@echo "$(GREEN)Database backed up to backups/$(RESET)"

##@ Development Tools

shell-backend: ## Open shell in backend container
	docker-compose exec backend /bin/bash

shell-frontend: ## Open shell in frontend container
	docker-compose exec frontend /bin/sh

shell: shell-backend ## Alias for backend shell

install-backend: ## Install backend dependencies locally
	cd backend && poetry install

install-frontend: ## Install frontend dependencies locally
	cd frontend && npm install

install: install-backend install-frontend ## Install all dependencies locally

##@ Cleanup

clean: ## Remove containers and images
	@echo "$(YELLOW)Cleaning up containers and images...$(RESET)"
	docker-compose down --rmi local

clean-all: ## Remove everything including volumes (⚠️  destroys data)
	@echo "$(YELLOW)⚠️  WARNING: This will delete all data, images, and containers!$(RESET)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v --rmi all; \
		docker system prune -f; \
	fi

prune: ## Clean up Docker system
	@echo "$(YELLOW)Pruning Docker system...$(RESET)"
	docker system prune -f

##@ Deployment

deploy: ## Deploy to production (with health checks)
	@if [ ! -f scripts/deploy.sh ]; then \
		echo "$(RED)ERROR: Deployment script 'scripts/deploy.sh' not found. Aborting.$(RESET)"; \
		exit 1; \
	fi
	@bash scripts/deploy.sh

pull: ## Pull latest images from registry
	docker-compose pull

push: ## Push images to registry
	@echo "$(GREEN)Pushing images to registry...$(RESET)"
	docker-compose push

##@ CI/CD Helpers

ci-build: ## Build for CI (with layer caching)
	DOCKER_BUILDKIT=1 docker-compose build \
		--build-arg BUILDKIT_INLINE_CACHE=1

ci-test: ## Run tests in CI mode
	docker-compose -f $(COMPOSE_FILE) run --rm backend poetry run pytest --cov --cov-report=xml
