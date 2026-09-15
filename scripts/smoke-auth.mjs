import { spawnSync } from 'node:child_process';

for (const script of ['scripts/smoke-auth-basics.mjs', 'scripts/smoke-email.mjs', 'scripts/smoke-two-factor.mjs']) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nAuthentication: every configured flow passed.\n');
