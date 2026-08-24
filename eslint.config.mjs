import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config, as ESLint 9 requires.
 *
 * `eslint-config-next` 16 ships native flat-config arrays, so they are spread
 * directly -- the `FlatCompat` bridge is for older eslintrc-style configs and
 * fails on this one.
 *
 * `core-web-vitals` is the baseline because a good share of the performance
 * budget in the brief (LCP, CLS) is lintable: unoptimised images, synchronous
 * scripts, missing `sizes`.
 */
const config = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.data/**'],
  },
  {
    rules: {
      // An unused variable is usually a mistake, but an intentionally ignored
      // one is legitimate; the underscore convention makes the intent explicit.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // `any` defeats the point of a typed domain model.
      '@typescript-eslint/no-explicit-any': 'error',
      // Type-only imports keep server modules out of the client bundle when
      // they were only ever needed for their types.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
];

export default config;
