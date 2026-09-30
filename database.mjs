import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DOCTORS } from './opd.mjs';
try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const mapNumbers = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key, typeof value === 'bigint' ? Number(value) : value]));
function wrap(query, exec) {
  return {async query(sql, parameters = []) { const result = await query(sql,parameters); return {rows:result.rows.map(mapNumbers)}; },exec};
}
async function lockLocalDatabase(dataDir) {
  if(dataDir==='memory://') return async()=>{};
  const lockPath=resolve(dataDir)+'.lock';
  await mkdir(resolve(dataDir,'..'),{recursive:true});
  async function acquire() { const file=await open(lockPath,'wx',0o600);await file.writeFile(String(process.pid));await file.close(); }
  try { await acquire(); }
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    const owner=Number(await readFile(lockPath,'utf8'));
    let alive=true;
    if(Number.isSafeInteger(owner)&&owner>0) {try{process.kill(owner,0);}catch(e){if(e.code==='ESRCH')alive=false;}}
    if(alive)throw Error('Local PostgreSQL is already open. Stop the app before setup, migration, backup or another server.');
    await unlink(lockPath);await acquire();
  }
  return ()=>unlink(lockPath);
}
export async function createDatabase({ connectionString = process.env.DATABASE_URL, dataDir = process.env.PGLITE_DATA_DIR || resolve('data/postgres'), initialize = true } = {}) {
  let db;
  if (connectionString) {
    const {default:pg} = await import('pg');
    pg.types.setTypeParser(20, value => Number(value));
    const pool = new pg.Pool({connectionString,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
    pool.on('error', () => console.error('Database connection interrupted'));
    db = wrap(pool.query.bind(pool), sql => pool.query(sql));
    db.transaction = async callback => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const value = await callback(wrap(client.query.bind(client),sql=>client.query(sql))); await client.query('COMMIT'); return value; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    };
    db.close = () => pool.end(); db.kind = 'postgres';
  } else {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
    const unlock=await lockLocalDatabase(dataDir);
    const { PGlite } = await import('@electric-sql/pglite');
    let local;
    try {local = await PGlite.create(dataDir);}catch(error){await unlock();throw error;}
    db = wrap(local.query.bind(local),local.exec.bind(local));
    db.transaction = callback => local.transaction(tx => callback(wrap(tx.query.bind(tx),tx.exec.bind(tx))));
    db.close = async () => {try{await local.close();}finally{await unlock();}}; db.dump = () => local.dumpDataDir(); db.kind = 'pglite';
  }
  if (initialize) { try { await initializeDatabase(db); } catch (error) { await db.close(); throw error; } }
  return db;
}
export async function initializeDatabase(db) {
  const schema = await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  await db.transaction(async tx => {
    await tx.exec(schema);
    for (const name of DOCTORS) await tx.query('INSERT INTO doctors(id,name,created_at) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',[randomUUID(),name,new Date().toISOString()]);
  });
}
let singleton;
export function getDatabase() {
  if (!singleton) singleton = createDatabase({initialize:!process.env.VERCEL && process.env.NODE_ENV !== 'production'}).catch(error => { singleton = undefined; throw error; });
  return singleton;
}
