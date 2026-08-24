# Quality gates. `make check` is what you and any agent run before "done".
# All rules are defined in config (pyproject.toml, .importlinter); this file
# only wires them together.

.PHONY: install fmt fmt-check lint types test arch check review audit hooks

install:  ## Create the venv and install all dev tools
	uv sync
	uv run pre-commit install

fmt:  ## Apply formatting
	uv run ruff format .

fmt-check:  ## Fail if code is not formatted (gate, does not modify)
	uv run ruff format --check .

lint:  ## Lint
	uv run ruff check .

types:  ## Type-check (strict on domain layer)
	uv run mypy

test:  ## Run tests with coverage; fails below the floor in pyproject.toml
	uv run pytest --cov --cov-report=term-missing

arch:  ## Check the layered import contract
	uv run lint-imports

audit:  ## Check dependencies for known vulnerabilities
	uv run pip-audit

check: fmt-check lint types test arch  ## The gate: format, lint, types, tests, architecture
	@echo "OK: all quality gates passed."

review:  ## Periodic review: complexity + coverage report (non-blocking read-out)
	uv run ruff check --select C901 .
	uv run pytest --cov --cov-report=term-missing
