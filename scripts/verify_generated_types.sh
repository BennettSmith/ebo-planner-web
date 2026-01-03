#!/usr/bin/env bash
set -euo pipefail

err() {
  printf "ERROR: %s\n" "$1" >&2
}

OPENAPI_DIR="${OPENAPI_DIR:-openapi}"

authgenie_openapi="${OPENAPI_DIR}/authgenie-openapi.yaml"
planner_openapi="${OPENAPI_DIR}/planner-openapi.yaml"

if [[ ! -f "${authgenie_openapi}" ]]; then
  err "Missing OpenAPI file: ${authgenie_openapi}"
  exit 1
fi

if [[ ! -f "${planner_openapi}" ]]; then
  err "Missing OpenAPI file: ${planner_openapi}"
  exit 1
fi

printf "OK: OpenAPI inputs present: %s, %s\n" "${authgenie_openapi}" "${planner_openapi}"

# Ensure generated TS types are up-to-date with OpenAPI YAMLs.
# This enforces the rule: if you copy new YAMLs into openapi/, you must re-run `npm run gen` and commit.

if [[ ! -f package.json ]]; then
  err "package.json is missing; cannot run code generation verification."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  err "npm is not available; cannot run code generation verification."
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "${tmp_dir}"; }
trap cleanup EXIT

cp -R functions/_generated "${tmp_dir}/generated_before"

# Run generation (uses openapi/ paths per package.json scripts).
npm run gen >/dev/null

if ! diff -qr "${tmp_dir}/generated_before" "functions/_generated" >/dev/null; then
  err "Generated types are out of date."
  err "Run: npm run gen"
  err "Then commit the updated files under: functions/_generated/"
  exit 1
fi

printf "OK: generated types are up to date.\n"


