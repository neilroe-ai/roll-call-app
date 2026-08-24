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

## Step 6 — Security stack (skill Phase 4, private-repo subset)
Repo is **private**, so the GHAS-only measures do not apply.

Applied:
- `.github/dependabot.yml` — weekly `npm` + `github-actions` updates.
- `.github/workflows/ci.yml` — added `permissions: contents: read`. It was
  missing, so CI ran on a broad default token.
- `docs/adr/0001-no-secrets-in-client-code.md` — the PWA ships all its JS to the
  browser, so no key or token may live in client code. Records what that means
  for CONCEPT.md open decision 2: browser sign-in is fine; an Apps Script
  endpoint deployed as "anyone can access" is an unauthenticated public
  read/write handle on the Sheet, because its URL ships in the bundle.

Skipped (unavailable on a private repo without GitHub Advanced Security):
CodeQL, secret scanning, push protection. `gitleaks` (CI + pre-commit) and
`npm audit --audit-level=high` remain the secret and dependency backstops.

Note: the skill's own `sets/typescript/ci.yml` already declares `permissions`.
This repo's `ci.yml` predates the skill extraction, so it never got the block.

Left for the user in the GitHub UI: Dependabot alerts, account 2FA, optional
branch protection on `main`.

Branch protection is **not available**: GitHub Free does not offer it on private
repos (rulesets API returns 403, "Upgrade to GitHub Pro or make this repository
public"). 2FA is on. Dependabot alerts left to the user.

## Step 7 — Settle Sheet access (CONCEPT.md open decision 2)
Chosen: **direct Sheets API with Google sign-in**, scope `drive.file`. The Apps
Script endpoint was rejected on the ADR 0001 constraint. Recorded as
`docs/adr/0002-google-sheet-access-via-browser-oauth.md`; CONCEPT.md decision 2
marked settled.

Knock-on: offline strategy (open decision 4) is now more important, because a
token can expire mid-lesson. Writes must queue locally; sign-in must never block
taking roll.

## Step 8 — Fix CI: gitleaks broke every pull request
The first push exposed two CI faults that `npm run check` cannot catch locally,
because they are workflow faults, not code faults.

1. **`gitleaks-action` hard-fails on `pull_request` without `GITHUB_TOKEN`.**
   Every PR failed before reaching the gates. Fixed by passing
   `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in the step's `env`. No
   `GITLEAKS_LICENSE` is needed — the repo belongs to a personal account.
2. **Actions pinned to majors running the deprecated Node 20 runtime.** Bumped
   `actions/checkout` v4 -> v7, `actions/setup-node` v4 -> v7,
   `gitleaks/gitleaks-action` v2 -> v3.

Also seen once and not a defect: the very first push failed the secret scan with
`ambiguous argument <root-commit>^..HEAD`. gitleaks asks for the parent of the
root commit, which does not exist. It only happens on the initial push of a repo
that already has history. Later pushes are green.

**Lesson for the skill:** a gate that only runs in CI is not proven by a local
`npm run check`. Prove the PR path with a throwaway pull request, not just a
push to `main`.
