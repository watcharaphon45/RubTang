import { startDatabase } from './embedded-db.mjs';

const db = await startDatabase({ directory: 'postgres', port: 5432, password: 'rubtang_local_only' });
console.log('Local PostgreSQL ready on 127.0.0.1:5432. Data persists in .local/postgres. Ctrl+C to stop.');
await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
await db.stop();
