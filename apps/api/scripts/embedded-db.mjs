import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';

export const apiRoot = fileURLToPath(new URL('../', import.meta.url));
export const workspaceRoot = resolve(apiRoot, '../..');
export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function startDatabase({ directory, port, password, disposable = false }) {
  const root = resolve(workspaceRoot, '.local');
  const target = resolve(root, directory);
  if (!target.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Database must stay inside workspace .local');
  await mkdir(target, { recursive: true });
  const logs = [];
  const log = message => { logs.push(String(message)); if (logs.length > 30) logs.shift(); };
  const db = new EmbeddedPostgres({
    databaseDir: target, user: 'rubtang', password, port,
    persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C', ...(disposable ? ['--no-sync'] : [])], postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onLog: log, onError: log,
  });
  try {
    if (!existsSync(join(target, 'PG_VERSION'))) await db.initialise();
    await db.start();
    const client = db.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['rubtang']);
      if (!found.rowCount) await client.query('CREATE DATABASE rubtang');
    } finally { await client.end(); }
    return db;
  } catch (error) { await db.stop().catch(() => {}); throw new Error(`${error.message}\n${logs.slice(-12).join('\n')}`); }
}
