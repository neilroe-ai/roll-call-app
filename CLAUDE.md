# Roll Call App — working rules

Quality gates live in config, not here: `package.json` (scripts), `tsconfig.json`
(strict types), `eslint.config.js` (lint), `.prettierrc.json` (format),
`vitest.config.ts` (tests + coverage floor), `.dependency-cruiser.cjs` (layers),
`.github/workflows/ci.yml` (CI). This file states behaviour only.
The architecture map — what each layer is for and where
decisions live — is `ARCHITECTURE.md`. The agreed domain vocabulary is
`CONTEXT.md`; use those terms exactly.

- Run `npm run check` before claiming any task complete. It must pass.
- Never commit with a red tree (failing `npm run check`).
- Architecture rules live in `.dependency-cruiser.cjs`. If it fails, fix the
  import, never edit the contract.
- Ask before adding a dependency.
- Use the terms in `CONTEXT.md`. If code needs a domain concept that isn't
  there, add it to `CONTEXT.md` rather than inventing a synonym.
