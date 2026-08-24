# Setup log

Record of how this project was set up for coding work.
Source material for the future `/setup-for-coding` skill.

## Step 1 — Git init and .gitignore
- `git init -b main` (default branch `main`)
- Python `.gitignore`: bytecode, venvs, tool caches, `.env` (keeping `.env.example`), editor/OS files
- `.claude/settings.local.json` ignored so personal permissions stay out of the repo
- Stack decision: **Python**

## Step 2 — Quality gates (before any feature work)
Decisions: Python 3.12 (via uv), package manager uv, coverage floor 70%,
layers `adapters -> services -> repositories -> domain` (may change with scope;
edit `.importlinter` only).

Installed / configured:
- `pyproject.toml` — ruff (lint+format, C90/C901 complexity), mypy (strict on
  `roll_call.domain.*` only), pytest, coverage (`fail_under = 70`). Single
  source of truth for these rules.
- `.importlinter` — `layers` contract encoding the inward-only direction.
- `.pre-commit-config.yaml` — local hooks: ruff format, ruff check, mypy,
  gitleaks. Local hooks reuse the uv-pinned tools so versions aren't duplicated.
- `.github/workflows/ci.yml` — uv sync, format check, lint, mypy, import
  contract, pytest+coverage, pip-audit, gitleaks.
- `Makefile` — `make check` (format, lint, types, tests, arch), plus `test`,
  `arch`, `review`, `audit`, `install`.
- `src/` uses a package-per-layer src layout so the contract has real modules.

Tooling notes:
- gitleaks 8.30.1 installed to `~/.local/bin` (no apt package; system binary).
- `make` is NOT installed and needs sudo; user must run the apt install once.
  All gate commands were proven individually via `uv run`.

Gates proven to fail then reverted:
- import-linter: domain importing services -> BROKEN, exit 1.
- mypy: untyped def in domain -> error; identical def in adapters -> pass
  (strictness scoped to domain).
- gitleaks: staged fake AWS secret -> commit blocked, HEAD unchanged, exit 1.

Coverage ratchet rule (how to know when to raise the floor):
The floor is a floor, not a target. `make review` / `make test` prints actual
coverage each run. When actual sits comfortably above the floor for a while,
raise `fail_under` in `pyproject.toml` to just under actual. Never lower it.
