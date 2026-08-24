# Roll Call App — working rules

Quality gates are defined in config, not here: `pyproject.toml` (ruff, mypy,
pytest, coverage), `.importlinter` (layers), `.pre-commit-config.yaml`, and
`.github/workflows/ci.yml`. This file states behaviour only.

- Run `make check` before claiming any task complete. It must pass.
- Never commit with a red tree (failing `make check`).
- Architecture rules live in `.importlinter`. If a contract fails, fix the
  import, never edit the contract.
- Ask before adding a dependency.
