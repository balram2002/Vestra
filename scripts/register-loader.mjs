import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * Installs the `@/*` alias and extensionless-import resolver from `loader.mjs`.
 *
 * Loaded via `--import` so the hooks are in place before the entry module is
 * resolved; registering from inside the entry module itself would be too late
 * for its own import statements.
 */
register('./loader.mjs', pathToFileURL(import.meta.filename));
