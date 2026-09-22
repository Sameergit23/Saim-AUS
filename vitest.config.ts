import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Security-critical, unit-testable modules. The Postgres adapter, the
      // composition root, and CLIs are exercised by integration/e2e, not units.
      include: [
        'src/core/**',
        'src/api/**',
        'src/config/**',
        'src/infra/**',
        'src/storage/memory/**',
      ],
      // Gate set below current actuals (≈98% lines / ≈92% branches) so the
      // build fails on a real coverage regression without flaking on churn.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 88,
        statements: 90,
      },
    },
  },
});
