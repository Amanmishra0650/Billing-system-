import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../database.mjs';
import { createPatient } from '../opd-service.mjs';
import { numbered } from '../billing.mjs';

test('UHIDs are unique, permanent and continue after reopening a database', async () => {
  const dataDir = await mkdtemp(join(tmpdir(),'billing-numbering-'));
  let db = await createDatabase({connectionString:'',dataDir});
  try {
    const first = await createPatient(db,{name:'First numbering patient'});
    assert.equal(first.patient_uid,'2011162');
    const patients = await Promise.all(['Second','Third'].map(name=>createPatient(db,{name})));
    assert.deepEqual(patients.map(p=>p.patient_uid).sort(),['2011163','2011164']);
    assert.equal((await db.query("SELECT nextval('opd_number_seq') AS n")).rows[0].n,1);
    await db.close();
    db = await createDatabase({connectionString:'',dataDir});
    assert.equal((await createPatient(db,{name:'After restart'})).patient_uid,'2011165');
    assert.equal((await db.query('SELECT patient_uid FROM patients WHERE id=$1',[first.id])).rows[0].patient_uid,'2011162');
    assert.equal((await db.query("SELECT nextval('opd_number_seq') AS n")).rows[0].n,2);
    assert.equal(numbered('OPD-',1),'OPD-0001');
    assert.equal(numbered('OPD-',10000),'OPD-10000');
    assert.equal(numbered('YPC-',1),'YPC-000001');
  } finally { await db.close(); }
});
