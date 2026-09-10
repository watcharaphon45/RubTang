import { startDatabase, freePort, apiRoot } from './embedded-db.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const port = await freePort();
const password = randomBytes(24).toString('hex');
console.log('Preparing isolated PostgreSQL 17 for integration tests...');
const db = await startDatabase({ directory: `integration-${randomUUID()}`, port, password, disposable: true });
let api;
let apiOutput = '';
try {
  const apiPort = await freePort();
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: `postgresql://rubtang:${password}@127.0.0.1:${port}/rubtang`, WEB_ORIGIN: 'http://localhost:5173', PORT: String(apiPort), RUBTANG_TEST_API: `http://127.0.0.1:${apiPort}/api` };
  const migration = await execute(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: apiRoot, env, windowsHide: true });
  console.log(migration.stdout);
  api = spawn(process.execPath, ['dist/main.js'], { cwd: apiRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  api.on('error', error => { apiOutput += error.message; });
  api.stdout.on('data', data => { apiOutput += data; });
  api.stderr.on('data', data => { apiOutput += data; });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${env.RUBTANG_TEST_API}/health`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    if (api.exitCode !== null) break;
    await setTimeout(250);
  }
  if (!ready) throw new Error(`API did not start:\n${apiOutput}`);
  try {
    const result = await execute(process.execPath, ['--test', 'test/integration.spec.mjs'], { cwd: apiRoot, env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    console.log(result.stdout);
  } catch (error) { console.error(error.stdout ?? error.message); console.error(error.stderr ?? ''); throw new Error('Database integration tests failed'); }
} finally {
  if (api && api.exitCode === null) {
    const exited = new Promise(resolve => api.once('exit', resolve));
    api.kill();
    await Promise.race([exited, setTimeout(5000)]);
  }
  await db.stop();
}
