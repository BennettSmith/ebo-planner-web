.PHONY: help ci changelog-verify changelog-release release-help

help:
	@echo "CI / verification:"
	@echo "  make ci"
	@echo ""
	@echo "Changelog / releasing:"
	@echo "  make changelog-verify"
	@echo "  make changelog-release VERSION=0.6.0"
	@echo "Then commit, tag v0.6.0, and push the tag."

# Canonical "green" definition for this repo.
# Today, this repo is mostly release plumbing; when the Next.js app lands, this will
# automatically start enforcing npm install/lint/test/build as well.
ci: changelog-verify
	@if [ -f package.json ]; then \
		echo "Node checks (install + lint + test + build)..."; \
		if [ -f package-lock.json ]; then npm ci; else npm install; fi; \
		npm run lint --if-present; \
		npm test --if-present; \
		npm run build --if-present; \
	else \
		echo "NOTE: No package.json; skipping Node checks."; \
	fi

changelog-verify:
	@./scripts/verify_changelog.sh
	@./scripts/verify_spec_lock.sh

changelog-release:
	@if [ -z "$(VERSION)" ]; then \
		echo "ERROR: VERSION is required. Example: make changelog-release VERSION=0.6.0" >&2; \
		exit 2; \
	fi
	@./scripts/release_changelog.sh "$(VERSION)"

release-help:
	@$(MAKE) help


