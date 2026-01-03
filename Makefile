.DEFAULT_GOAL := help

.PHONY: help ci changelog-verify changelog-release release-help dev test test-watch gen build typecheck

help: ## Show available targets
	@echo "Targets:"
	@awk 'BEGIN {FS=":.*## "}; /^[a-zA-Z0-9][a-zA-Z0-9_-]*:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Notes:"
	@echo "  - Most developer workflows are backed by npm scripts (see package.json)."
	@echo "  - CI is defined by: make ci"

dev: ## Run local Pages dev server (wrangler pages dev)
	@npm run dev

test: ## Run unit tests with coverage gate (>= 85%)
	@npm test

test-watch: ## Run unit tests in watch mode (TDD loop)
	@npm run test:watch

gen: ## Generate OpenAPI-derived TypeScript types
	@npm run gen

build: ## Typecheck and bundle worker to public/_worker.js
	@npm run build

typecheck: ## Typecheck only
	@npm run typecheck

# Canonical "green" definition for this repo.
# Today, this repo is mostly release plumbing; when the Next.js app lands, this will
# automatically start enforcing npm install/lint/test/build as well.
ci: changelog-verify ## Run repo CI checks (includes npm test/build when package.json exists)
	@if [ -f package.json ]; then \
		echo "Node checks (install + lint + test + build)..."; \
		if [ -f package-lock.json ]; then npm ci; else npm install; fi; \
		npm run lint --if-present; \
		npm test --if-present; \
		npm run build --if-present; \
	else \
		echo "NOTE: No package.json; skipping Node checks."; \
	fi

changelog-verify: ## Verify CHANGELOG.md format and generated types are up to date
	@bash ./scripts/verify_changelog.sh
	@bash ./scripts/verify_generated_types.sh

changelog-release: ## Prepare CHANGELOG.md for a release (requires VERSION=x.y.z)
	@if [ -z "$(VERSION)" ]; then \
		echo "ERROR: VERSION is required. Example: make changelog-release VERSION=0.6.0" >&2; \
		exit 2; \
	fi
	@./scripts/release_changelog.sh "$(VERSION)"

release-help: ## Alias for `make help`
	@$(MAKE) help

