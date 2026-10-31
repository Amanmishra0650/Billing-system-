import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../database.mjs';
import {createPatient,findPatients,createVisit} from '../opd-service.mjs';
import {createStandaloneInvoice} from '../invoice-patients.mjs';
import {createMedicine} from '../medicines.mjs';
import {getInvoice} from '../billing.mjs';
import {seedAdmin} from '../auth.mjs';
import {readFile} from 'node:fs/promises';
import {migrateInvoicePatients} from '../invoice-patient-migration.mjs';

test('invoice search distinguishes same names and medicine-only invoices retain patient identity',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try{
    await seedAdmin(db,'test','test-password-only');
    const user=(await db.query('SELECT id FROM users LIMIT 1')).rows[0].id;
    const doctor=(await db.query('SELECT id FROM doctors LIMIT 1')).rows[0].id;
    const first=await createPatient(db,{name:'Ritika',mobile:'9876543210',age:'24',gender:'Female',address:'First address'});
    const second=await createPatient(db,{name:'Ritika',mobile:'8765432109',age:'38',gender:'Female',confirm_distinct_patient:true});
    await createVisit(db,{clinic_address_id:'munshipuliya',patient_id:first.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:40000,payment_status:'unpaid',visited_at:'2026-10-31T09:00:00Z'},user);
    const matches=await findPatients(db,'rIt');
    assert.equal(matches.length,2);assert.notEqual(matches[0].patient_uid,matches[1].patient_uid);
    assert.equal(matches.find(p=>p.id===first.id).last_visit_at,'2026-10-31T09:00:00.000Z');
    assert.equal((await findPatients(db,first.patient_uid))[0].id,first.id);
    assert.equal((await findPatients(db,'98765'))[0].id,first.id);
    assert.equal((await findPatients(db,'r')).length,0);
    assert.deepEqual(Object.keys(matches[0]).sort(),['id','patient_uid','name','mobile','age','gender','address','last_visit_at'].sort());
    const medicine=await createMedicine(db,{name:'Invoice identity tablet',selling_price:100});
    const input={clinic_address_id:'munshipuliya',patient_id:second.id,payment_mode:'CASH',paid_paise:0,items:[{type:'Medicine',medicine_id:medicine.id,quantity:1}]};
    const invoice=await createStandaloneInvoice(db,input,user);
    assert.equal(invoice.patient_id,second.id);assert.equal(invoice.registration,second.patient_uid);
    assert.equal(invoice.patient_mobile,second.mobile);assert.equal(invoice.patient_name,'Ritika');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n,2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM opd_visits')).rows[0].n,1);
    await assert.rejects(createStandaloneInvoice(db,{...input,patient_details:{age:'39'}},user),/confirm/i);
    const updated=await createStandaloneInvoice(db,{...input,patient_details:{age:'39',address:'New address'},confirm_patient_update:true},user);
    assert.equal(updated.age,'39');assert.equal(updated.patient_address,'New address');
    assert.equal((await getInvoice(db,invoice.id)).age,'38');
    assert.equal((await getInvoice(db,invoice.id)).patient_address,'');
    await assert.rejects(createStandaloneInvoice(db,{...input,patient_details:{name:'Wrong patient'}},user),/name|patient/i);
  }finally{await db.close();}
});

test('new invoice patient is created atomically and duplicate names never auto-select',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try{
    const input={clinic_address_id:'munshipuliya',patient:{name:'New invoice patient'},payment_mode:'CASH',paid_paise:0,items:[{type:'Service',description:'Service',quantity:1,unit_price_paise:10000}]};
    await assert.rejects(createStandaloneInvoice(db,{...input,items:[]}));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n,0);
    const invoice=await createStandaloneInvoice(db,input);
    assert.ok(invoice.patient_id);assert.equal(invoice.registration,'2011162');
    await assert.rejects(createStandaloneInvoice(db,input),/existing patient/i);
    const again=await createStandaloneInvoice(db,{...input,patient:undefined,patient_id:invoice.patient_id});
    assert.equal(again.registration,invoice.registration);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM opd_visits')).rows[0].n,0);
    const concurrent=await Promise.allSettled([1,2].map(()=>createStandaloneInvoice(db,{...input,patient:{name:'Concurrent invoice patient'}})));
    assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM patients WHERE name='Concurrent invoice patient'")).rows[0].n,1);
  }finally{await db.close();}
});

test('invoice patient snapshot migration is additive and repeatable for legacy invoices',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://',initialize:false});
  try{
    const schema=(await readFile(new URL('../schema.sql',import.meta.url),'utf8')).replace(/^ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_(mobile|address).*$/gm,'');
    await db.exec(schema);
    await db.query("INSERT INTO invoices(invoice_number,created_at,patient_name,registration,payment_mode,paid_paise,tax_rate_bps,subtotal_paise,cgst_paise,sgst_paise,total_paise) VALUES('OLD-1','2026-01-01','Old identity','OLD-UID','CASH',0,900,10000,900,900,11800)");
    const original=(await db.query('SELECT * FROM invoices')).rows[0];
    await migrateInvoicePatients(db);const after=(await db.query('SELECT * FROM invoices')).rows[0];
    const {patient_mobile,patient_address,...preserved}=after;
    assert.deepEqual(preserved,original);assert.equal(patient_mobile,'');assert.equal(patient_address,'');
    await migrateInvoicePatients(db);assert.deepEqual((await db.query('SELECT * FROM invoices')).rows[0],after);
  }finally{await db.close();}
});
