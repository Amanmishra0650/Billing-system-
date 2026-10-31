import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createDatabase} from '../database.mjs';
import {createPatient,insertPatient} from '../patients.mjs';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrateUhidCounter} from '../uhid-counter-migration.mjs';

test('UHID allocation rolls back failed registrations without consuming a number',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try{
    await assert.rejects(db.transaction(async tx=>{await insertPatient(tx,{name:'Rolled back patient'});throw Error('failed registration');}),/failed registration/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n,0);
    assert.equal((await createPatient(db,{name:'First counter patient'})).patient_uid,'2011162');
    const patients=await Promise.all(['Second counter patient','Third counter patient'].map(name=>createPatient(db,{name})));
    assert.deepEqual(patients.map(p=>p.patient_uid).sort(),['2011163','2011164']);
  }finally{await db.close();}
});

test('UHID migration preserves issued numbers and never reapplies legacy recovery jumps',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://',initialize:false});
  try{
    await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
    await db.query("INSERT INTO patients(id,uid_sequence,patient_uid,name,created_at,updated_at) VALUES($1,2011294,'2011294','Preserved patient','2026-11-01','2026-11-01')",[randomUUID()]);
    await db.query("SELECT setval('patient_uid_seq',2011294,true)");
    const original=(await db.query('SELECT * FROM patients')).rows;
    assert.equal((await migrateUhidCounter(db)).nextUhid,2011295);
    await db.query("SELECT setval('patient_uid_seq',2050000,true)");
    assert.equal((await migrateUhidCounter(db)).nextUhid,2011295);
    assert.deepEqual((await db.query('SELECT * FROM patients')).rows,original);
    assert.equal((await createPatient(db,{name:'Next patient'})).patient_uid,'2011295');
  }finally{await db.close();}
});

test('UHIDs remain consecutive after abrupt process exits',()=>{
  return (async()=>{
    const dataDir=await mkdtemp(join(tmpdir(),'billing-uhid-crash-'));
    const databaseUrl=new URL('../database.mjs',import.meta.url).href;
    const patientsUrl=new URL('../patients.mjs',import.meta.url).href;
    const values=[];
    for(let run=0;run<3;run++){
      const source=`import {createDatabase} from ${JSON.stringify(databaseUrl)};import {createPatient} from ${JSON.stringify(patientsUrl)};const db=await createDatabase({connectionString:'',dataDir:${JSON.stringify(dataDir)}});const patient=await createPatient(db,{name:'Crash test ${run}'});console.log(patient.patient_uid);process.exit(0);`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',windowsHide:true});
      assert.equal(child.status,0,child.stderr);values.push(child.stdout.trim());
    }
    assert.deepEqual(values,['2011162','2011163','2011164']);
  })();
});
