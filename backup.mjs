import { createDatabase } from './database.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const directory=resolve(process.argv[2]||'backups');
await mkdir(directory,{recursive:true,mode:0o700});
const name=`yogi-billing-${new Date().toISOString().replace(/[:.]/g,'-')}`;
if(process.env.DATABASE_URL) {
  const target=resolve(directory,name+'.dump');
  // libpq accepts connection URIs via PGDATABASE; no secret in the command arguments.
  const child=spawn('pg_dump',['--format=custom','--no-owner','--no-acl','--file',target],{env:{...process.env,PGDATABASE:process.env.DATABASE_URL},stdio:['ignore','ignore','ignore'],windowsHide:true});
  child.on('error',()=>{console.error('pg_dump is required for PostgreSQL backups. Install PostgreSQL client tools.');process.exitCode=1;});
  child.on('exit',code=>{if(code===0)console.log(`Backup saved to ${target}`);else{console.error('PostgreSQL backup failed. Check connection and client installation.');process.exitCode=1;}});
} else {
  const db=await createDatabase({initialize:false});
  try { const dump=await db.dump(), target=resolve(directory,name+'.tar.gz');await writeFile(target,Buffer.from(await dump.arrayBuffer()),{mode:0o600});console.log(`Local PostgreSQL backup saved to ${target}`); }
  finally { await db.close(); }
}
