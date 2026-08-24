/**
 * Layered architecture. Imports point inward only:
 *   ui  ->  infra  ->  domain     (domain imports nothing outward)
 * This file is the single source of truth for the layer direction.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'domain is the core: it must not import from infra or ui.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(infra|ui)' },
    },
    {
      name: 'infra-no-ui',
      comment: 'infra may use domain, but must not import from ui.',
      severity: 'error',
      from: { path: '^src/infra' },
      to: { path: '^src/ui' },
    },
    {
      name: 'no-orphans',
      comment: 'unreferenced modules usually mean dead code.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.test\\.ts$', '\\.config\\.(ts|js|cjs)$', 'src/ui/main\\.ts$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js'] },
  },
};
