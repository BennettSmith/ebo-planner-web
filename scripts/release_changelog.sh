#!/usr/bin/env bash
set -euo pipefail

CHANGELOG_FILE="${CHANGELOG_FILE:-CHANGELOG.md}"
# NOTE: This repo vendors its OpenAPI inputs (openapi/*.yaml). We do not pin an external spec repo via spec.lock.

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release_changelog.sh 0.6.0
  ./scripts/release_changelog.sh v0.6.0
EOF
}

err() {
  printf "ERROR: %s\n" "$1" >&2
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

raw_version="$1"
version="${raw_version#v}"
if [[ -z "${version}" ]]; then
  err "Version argument is empty."
  exit 2
fi
if [[ "${version}" =~ [[:space:]] ]]; then
  err "Version must not contain whitespace."
  exit 2
fi

if [[ ! -f "${CHANGELOG_FILE}" ]]; then
  err "${CHANGELOG_FILE} is missing."
  exit 1
fi

if grep -Eq "^## \\[${version//./\\.}\\]" "${CHANGELOG_FILE}"; then
  err "Version section already exists in ${CHANGELOG_FILE}: ## [${version}]"
  err "Refusing to create a duplicate (idempotent-safe)."
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure Unreleased + required headings exist.
"${script_dir}/verify_changelog.sh" >/dev/null

# Ensure generated types are up-to-date with vendored OpenAPI before cutting a web release.
bash "${script_dir}/verify_generated_types.sh" >/dev/null

today="$(date +%F)"

tmpfile="$(mktemp "${TMPDIR:-/tmp}/release_changelog.XXXXXX")"
trap 'rm -f "${tmpfile}"' EXIT

awk -v version="${version}" -v today="${today}" '
  function is_section_header(line) { return (line ~ /^## \[/) }
  function is_unreleased_header(line) { return (line == "## [Unreleased]") }
  function is_subheader(line) { return (line ~ /^### /) }
  function has_non_ws(line) { return (line ~ /[^[:space:]]/) }

  function print_version_section(   any_changes, k, i, h, n, j) {
    any_changes = 0

    for (k in body) {
      if (has_non_ws(body[k])) { any_changes = 1 }
    }
    for (i = 1; i <= preamble_count; i++) {
      if (has_non_ws(preamble[i])) { any_changes = 1 }
    }

    if (!any_changes) {
      print "__EBO_NO_CHANGES__" > "/dev/stderr"
      exit 3
    }

    print ""
    print "## [" version "] - " today

    for (i = 1; i <= preamble_count; i++) {
      print preamble[i]
    }

    headings[1] = "### Added"
    headings[2] = "### Changed"
    headings[3] = "### Deprecated"
    headings[4] = "### Removed"
    headings[5] = "### Fixed"
    headings[6] = "### Security"

    for (i = 1; i <= 6; i++) {
      h = headings[i]
      print h

      if (h in body) {
        n = split(body[h], lines, "\n")
        for (j = 1; j <= n; j++) {
          if (j == n && lines[j] == "") continue
          print lines[j]
        }
      }
    }
    print ""
  }

  BEGIN {
    in_unreleased = 0
    inserted = 0
    current = ""
    preamble_count = 0
  }

  {
    line = $0

    if (is_unreleased_header(line)) {
      in_unreleased = 1
      current = ""
      print line
      next
    }

    if (in_unreleased && is_section_header(line) && !is_unreleased_header(line)) {
      if (!inserted) {
        inserted = 1
        print_version_section()
      }
      in_unreleased = 0
      print line
      next
    }

    if (in_unreleased) {
      if (is_subheader(line)) {
        current = line
        print line
        next
      }

      # Capture preamble (content before first ###) or body lines, but DO NOT print.
      if (current == "") {
        preamble[++preamble_count] = line
        next
      }

      body[current] = body[current] line "\n"
      next
    }

    print line
  }

  END {
    if (in_unreleased && !inserted) {
      inserted = 1
      print_version_section()
    }
  }
' "${CHANGELOG_FILE}" > "${tmpfile}" 2> "${tmpfile}.err" || {
  if grep -q "__EBO_NO_CHANGES__" "${tmpfile}.err"; then
    err "No changes found under ## [Unreleased]. Add entries before cutting a web release."
    exit 1
  fi
  cat "${tmpfile}.err" >&2 || true
  err "Failed to cut release from ${CHANGELOG_FILE}."
  exit 1
}

mv "${tmpfile}" "${CHANGELOG_FILE}"
rm -f "${tmpfile}.err" || true

printf "OK: Cut web release %s (%s) in %s\n" "${version}" "${today}" "${CHANGELOG_FILE}"


