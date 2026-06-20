// eslint.config.js — flat config for the api-spy monorepo.
//
// Scope: src/ + tests/ in the 3 active packages. legacy/ is frozen
// and excluded.
//
// Style:
// - Node + ESM globals (`globalThis`, `process`, `console`, etc.)
// - JS test files use Node's built-in test runner; `test` and
//   `describe` are globals
// - Pragmatic: no formatting wars. Style rules focus on real
//   readability and correctness (no-shadow, no-unused-vars,
//   no-undef, prefer-const). Style opinions (quotes, semi) are
//   NOT enforced — they should be handled by a separate formatter
//   (Prettier) if the team ever wants one.

import js from '@eslint/js'
import globals from 'globals'

export default [
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      'legacy/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'examples/demo-app/public/**',
      // Vite-built artifacts in demo
      'examples/demo-app/dist/**'
    ]
  },

  // Base rules for all source files (src/ of every package)
  {
    files: ['packages/*/src/**/*.js', 'examples/demo-app/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-shadow': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-throw-literal': 'error',
      'no-return-await': 'off'
    }
  },

  // Source files in the React overlay — browser environment.
  // Placed AFTER the base config so browser globals override node globals
  // for overlay files (later configs take precedence in flat config).
  {
    files: ['packages/api-spy-overlay-react/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-shadow': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-throw-literal': 'error',
      'no-return-await': 'off'
    }
  },

  // Test files — relax a few rules that are noisy in test contexts
  {
    files: [
      'packages/*/tests/**/*.js',
      'examples/demo-app/tests/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        // Node's built-in test runner
        test: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-shadow': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-undef': 'error'
    }
  },

  // Demo-app vite.config.js — same as base but allow dev config file shape
  {
    files: ['examples/demo-app/vite.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules
    }
  }
]