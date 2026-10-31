import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase} from '../database.mjs';
import {medicineSchema} from '../medicine-migration.mjs';
import {migrateDailyOpd} from '../daily-opd-migration.mjs';
import {createPatient,createVisit} from '../opd-service.mjs';
import {createMedicine} from '../medicines.mjs';
import {seedAdmin} from '../auth.mjs';
import {uhidCounterSchema} from '../uhid-counter-migration.mjs';

test('historical daily OPD migration preserves records and is repeatable',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://',initialize:false});
  try{
    await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
    await db.exec(await medicineSchema());
    await db.exec(await uhidCounterSchema());
    await seedAdmin(db,'test','test-password-only');
    const user=(await db.query('SELECT id FROM users LIMIT 1')).rows[0].id;
    const doctor=randomUUID();
    await db.query('INSERT INTO doctors(id,name,created_at) VALUES($1,$2,$3)',[doctor,'Migration doctor','2026-01-01']);
    const patient=await createPatient(db,{name:'Historical patient'});
    await createMedicine(db,{name:'Preserved medicine',selling_price:420});
    const dates=['2026-11-01T18:29:59Z','2026-11-01T00:00:00Z','2026-11-01T18:30:00Z'];
    for(const [index,date] of dates.entries())await db.query(`INSERT INTO opd_visits(id,opd_sequence,opd_number,patient_id,doctor_id,illness_code,illness_text,consultation_fee_paise,payment_status,visited_at,created_by,created_at) VALUES($1,$2,$3,$4,$5,'piles','Piles',40000,'unpaid',$6,$7,$6)`,[randomUUID(),100+index,'OPD-'+(100+index),patient.id,doctor,date,user]);
    const old=(await db.query('SELECT * FROM opd_visits ORDER BY opd_sequence')).rows;
    assert.equal((await migrateDailyOpd(db)).preserved,true);
    const visits=(await db.query("SELECT *,to_char(opd_date,'YYYY-MM-DD') AS opd_date FROM opd_visits ORDER BY opd_sequence")).rows;
    assert.deepEqual(visits.map(v=>v.daily_opd_number),[2,1,1]);
    assert.deepEqual(visits.map(v=>v.opd_date),['2026-11-01','2026-11-01','2026-11-02']);
    assert.deepEqual(visits.map(({opd_date,daily_opd_number,...v})=>v),old);
    await migrateDailyOpd(db);
    assert.deepEqual((await db.query("SELECT *,to_char(opd_date,'YYYY-MM-DD') AS opd_date FROM opd_visits ORDER BY opd_sequence")).rows,visits);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM medicines')).rows[0].n,1);
    await db.query("SELECT setval('opd_number_seq',103,false)");
    const next=await createVisit(db,{clinic_address_id:'munshipuliya',patient_id:patient.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:40000,payment_status:'unpaid',visited_at:'2026-11-01T01:00:00Z'},user);
    assert.equal(next.daily_opd_number,3);
    await migrateDailyOpd(db);
    assert.equal((await db.query("SELECT last_number FROM opd_daily_counters WHERE opd_date='2026-11-01'")).rows[0].last_number,3);
  }finally{await db.close();}
});
