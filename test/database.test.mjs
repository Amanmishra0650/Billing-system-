import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase } from '../database.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('local PostgreSQL rejects a second process connection to the same directory',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'yogi-db-')), dataDir=join(directory,'postgres');
  const db=await createDatabase({connectionString:'',dataDir});
  try { await assert.rejects(async()=>{ const duplicate=await createDatabase({connectionString:'',dataDir});await duplicate.close(); },/already open/i); }
  finally { await db.close();await rm(directory,{recursive:true,force:true}); }
});

test('local backup restores to a new PostgreSQL directory without replacing the source',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'yogi-restore-')), source=join(directory,'original'), destination=join(directory,'restored'), archive=join(directory,'backup.tar.gz');
  const db=await createDatabase({connectionString:'',dataDir:source});
  await db.query("INSERT INTO users(username,salt,hash) VALUES('restore-test','salt','hash')");
  await writeFile(archive,Buffer.from(await (await db.dump()).arrayBuffer()));await db.close();
  try {
    const restore=spawnSync(process.execPath,[fileURLToPath(new URL('../restore-local.mjs',import.meta.url)),archive,destination],{encoding:'utf8'});
    assert.equal(restore.status,0,restore.stderr);
    const restored=await createDatabase({connectionString:'',dataDir:destination});
    try {assert.equal((await restored.query('SELECT username FROM users')).rows[0].username,'restore-test');}finally{await restored.close();}
    const refusal=spawnSync(process.execPath,[fileURLToPath(new URL('../restore-local.mjs',import.meta.url)),archive,destination],{encoding:'utf8'});
    assert.notEqual(refusal.status,0);assert.match(refusal.stderr,/already exists/);
    const original=await createDatabase({connectionString:'',dataDir:source});
    try {assert.equal((await original.query('SELECT username FROM users')).rows[0].username,'restore-test');}finally{await original.close();}
  }finally{await rm(directory,{recursive:true,force:true});}
});
