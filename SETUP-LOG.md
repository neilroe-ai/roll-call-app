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

## Step 3 — Git guardrails (Claude Code PreToolUse hook)
Scope: **project only** (`.claude/`), committed so it travels with the repo.
Transferable to global later: copy the script to `~/.claude/hooks/` and add the
same hook block to `~/.claude/settings.json`, swapping `$CLAUDE_PROJECT_DIR` for `~`.

- `.claude/hooks/block-dangerous-git.sh` — blocks push, reset --hard,
  clean -f/-fd, branch -D, checkout ./restore ., push --force. Exit 2 tells
  Claude Code to refuse the command.
- `.claude/settings.json` — registers it as a PreToolUse hook on `Bash`.

Changed from the stock skill: rewrote the script to be **jq-free** (uses
python3, falls back to scanning raw hook input). Reason: jq was not installed,
and the stock script fails *open* (silently allows everything) without it. The
rewrite degrades to "still catches", never "silently off".

Verified: 6 dangerous commands -> exit 2 (blocked); benign git/uv -> exit 0;
malformed input containing a pattern -> still blocked.

Note: hooks load at session start, so this guard applies to NEW Claude Code
sessions. Restart the session for it to intercept commands in-flight.

### Step 3 amendment — push is "ask", not blocked
Reworked the hook from a hard block into a two-tier permission decision
(JSON `hookSpecificOutput.permissionDecision`, verified against Claude Code
2.1.232):
- **deny** (never permitted): reset --hard, clean -f/-fd, branch -D,
  checkout ./restore .
- **ask** (escalates to the user): git push, push --force. Claude runs the
  push; Claude Code pauses and asks the user to approve each one.

Rationale: user wants Claude to do the pushing, gated by approval, not blocked.
The `ask` decision holds even after a permission allowlist is added, so a broad
allowlist cannot auto-approve a push.

## Step 4 — Convert to TypeScript + PWA stack
The app is a phone-first PWA backed by a Google Sheet (see CONCEPT.md), so the
Python scaffolding from steps 1–2 was removed (recoverable from git history) and
rebuilt in JS/TS. Git guardrails (step 3) were kept unchanged.

Toolchain (uv/ruff/mypy/pytest/import-linter -> Node equivalents):
- `package.json` — scripts; `npm run check` is the single gate command
  (format:check, lint, typecheck, test, arch).
- `tsconfig.json` — TypeScript `strict` project-wide (simpler than the Python
  per-layer approach; the whole app is small).
- `eslint.config.js` — ESLint flat config (+ typescript-eslint), formatting
  rules turned off via eslint-config-prettier.
- `.prettierrc.json` / `.prettierignore` — Prettier owns formatting. Markdown is
  ignored so hand-edited docs (CONCEPT.md, SETUP-LOG.md) don't trip the gate.
- `vitest.config.ts` — Vitest + v8 coverage, floor 70% on statements/branches/
  functions/lines, scoped to src/domain + src/infra (UI/entry excluded).
- `.dependency-cruiser.cjs` — layered contract (ui -> infra -> domain, inward
  only). Single source of truth for layer direction. Replaces .importlinter.
- `.husky/pre-commit` + `.lintstagedrc.json` — on commit: lint-staged
  (prettier + eslint --fix on staged), whole-project tsc, gitleaks secret scan.
  Replaces the Python pre-commit framework.
- `.github/workflows/ci.yml` — Node CI: format, lint, types, tests+coverage,
  arch, npm audit, gitleaks.

First real code seeded: `src/domain/points.ts` implements the attendance/behavior
point logic from CONCEPT.md, fully tested (5 tests, 100% coverage of domain).

Baseline: `npm run check` exits 0.

## Step 5 — Extract the setup into the /setup-for-coding skill
The whole setup process (bootstrap + concept + gate set + security) was enshrined
as a user-invoked skill at `~/.claude/skills/setup-for-coding/`. Structure:
- `SKILL.md` — phased flow. Two rules baked in: **concept before stack**, and
  **prove every gate bites**.
- `bootstrap/` — git guardrails hook, base .gitignore, settings hook.
- `sets/typescript/` — this repo's config templated (copy, don't regenerate).
- `sets/python/` — the earlier Python stack templated (from git history).
- `security/` — Dependabot, CodeQL, least-privilege CI perms, /wizard dashboard
  checklist (secret scanning, push protection, 2FA, branch protection).

Not yet dry-run on a fresh project (the "work out the bugs" pass).
