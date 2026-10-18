import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,initializeDatabase} from '../database.mjs';
import {seedAdmin} from '../auth.mjs';
import {createPatient,createVisit,getVisit} from '../opd-service.mjs';
import {CLINIC_ADDRESSES} from '../public/clinic-addresses.js';
import {renderOpdSlip} from '../public/opd-print.js';

test('OPD requires a clinic address and preserves it on the saved slip and history',async()=>{
 const db=await createDatabase({connectionString:'',dataDir:'memory://'});
 try{
  await seedAdmin(db,'test','test-password-only');
  const user=(await db.query('SELECT id FROM users')).rows[0].id;
  const doctor=(await db.query('SELECT id FROM doctors LIMIT 1')).rows[0].id;
  const patient=await createPatient(db,{name:'OPD address patient',address:'Patient home address'});
  const input={patient_id:patient.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:40000,payment_status:'unpaid'};
  for(const id of [undefined,null,'',{},'unknown'])await assert.rejects(()=>createVisit(db,{...input,clinic_address_id:id},user),/select.*address/i);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM opd_visits')).rows[0].n,0);
  for(const clinic of CLINIC_ADDRESSES){
   const saved=await createVisit(db,{...input,clinic_address_id:clinic.id,clinic_address:'Forged clinic address'},user);
   assert.equal(saved.clinic_address,clinic.address);
   assert.equal(saved.address,'Patient home address');
   await initializeDatabase(db);
   const reopened=await getVisit(db,saved.id);
   assert.equal(reopened.clinic_address,clinic.address);
   const slip=renderOpdSlip(reopened,{esc:v=>String(v??''),fmt:p=>String(p/100),words:()=>''});
   assert.ok(slip.includes(clinic.address));
   const legacySlip=renderOpdSlip({...reopened,clinic_address:null},{esc:v=>String(v??''),fmt:p=>String(p/100),words:()=>''});
   assert.ok(legacySlip.includes('Munshipuliya, Lucknow, Uttar Pradesh'));
  }
 }finally{await db.close();}
});
