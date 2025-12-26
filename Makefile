.PHONY: changelog-verify changelog-release release-help

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
	@echo "Web app releases:"
	@echo "  1) Update spec.lock to the spec tag targeted (e.g. v1.2.3)"
	@echo "  2) Add Unreleased notes in CHANGELOG.md (pages/routes/auth/session/RSVP/API UX)"
	@echo "  3) make changelog-release VERSION=0.6.0"
	@echo "  4) Commit CHANGELOG.md (+ spec.lock if changed), tag v0.6.0, push tag"


