import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest/Vite does not read tsconfig `paths` or the package.json `imports`
// field, so the CLI's `#cli/*` and vendored `@genshot/shared/*` specifiers are
// mapped here to match tsconfig.json. Exact barrel matches come before the
// catch-all so subpaths (e.g. billing/pricing) resolve to their own files.
const abs = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@genshot\/shared\/auth$/, replacement: abs('./vendor/shared/auth/index.ts') },
      { find: /^@genshot\/shared\/billing$/, replacement: abs('./vendor/shared/billing/index.ts') },
      {
        find: /^@genshot\/shared\/generation$/,
        replacement: abs('./vendor/shared/generation/index.ts'),
      },
      { find: /^@genshot\/shared\/banner$/, replacement: abs('./vendor/shared/banner.ts') },
      { find: /^@genshot\/shared\/(.*)$/, replacement: `${abs('./vendor/shared')}/$1` },
      { find: /^#cli\/(.*)$/, replacement: `${abs('./src')}/$1` },
    ],
  },
});
