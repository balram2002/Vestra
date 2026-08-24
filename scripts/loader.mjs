import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * ESM resolver hook for running project code outside Next.js.
 *
 * Node can execute TypeScript directly (type stripping is on by default from
 * Node 22.18), but it does not implement two things the Next/TypeScript
 * toolchain provides:
 *
 *   1. the `@/*` path alias from `tsconfig.json`;
 *   2. extensionless and directory-index imports (`./media`, `../db/client`).
 *
 * This hook supplies both so `npm run seed` executes the same modules the app
 * does, rather than a duplicated copy of the seeding logic.
 *
 * `server-only` is handled separately by running Node with
 * `--conditions=react-server`, which makes that package resolve to its
 * intentionally-empty server entry point instead of the module that throws.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json'];

/** Resolve a bare filesystem path to a real file, probing TS extensions. */
function probe(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;

  for (const ext of EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    if (existsSync(candidate)) return candidate;
  }

  // Directory import: fall back to an index file.
  if (existsSync(basePath) && statSync(basePath).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const candidate = path.join(basePath, `index${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `@/foo/bar` -> `<root>/src/foo/bar`
  if (specifier.startsWith('@/')) {
    const resolved = probe(path.join(SRC, specifier.slice(2)));
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  // Relative imports without an extension, which TypeScript allows.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : ROOT;
    const resolved = probe(path.resolve(path.dirname(parentPath), specifier));
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
