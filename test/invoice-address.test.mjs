import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,initializeDatabase} from '../database.mjs';
import {insertInvoice,getInvoice} from '../billing.mjs';
import {seedAdmin} from '../auth.mjs';
import {createPatient,createVisit,invoiceFromVisit} from '../opd-service.mjs';

const input={patient_name:'Address test patient',payment_mode:'CASH',paid_paise:0,items:[{type:'Service',description:'Consultation',quantity:1,unit_price_paise:10000}]};
const addresses={munshipuliya:'Munshipuliya, Lucknow, Uttar Pradesh',priyadarshini:'1/26, Sector-c, Priyadarshini Yojna, Near Kiran Gas Service, Faizullahganj Road, Sitapur Road, Puraniya Tiraha, Lucknow.'};
test('invoice requires an available clinic address and persists its snapshot across reinitialization',async()=>{
 const db=await createDatabase({connectionString:'',dataDir:'memory://'});
 try{
  for(const id of [undefined,'',null,'unknown',{},['munshipuliya']]){
   await assert.rejects(()=>db.transaction(tx=>insertInvoice(tx,{...input,clinic_address_id:id})),/select.*address/i);
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM invoices')).rows[0].n,0);
  for(const [id,address] of Object.entries(addresses)){
   const invoice=await db.transaction(tx=>insertInvoice(tx,{...input,clinic_address_id:id,clinic_address:'Forged address'}));
   assert.equal(invoice.clinic_address,address);
   await initializeDatabase(db);
   assert.equal((await getInvoice(db,invoice.id)).clinic_address,address);
  }
 }finally{await db.close();}
});
test('OPD invoices preserve the selected clinic address on repeat saves',async()=>{
 const db=await createDatabase({connectionString:'',dataDir:'memory://'});
 try{
  await seedAdmin(db,'test','test-password-only');
  const user=(await db.query('SELECT id FROM users')).rows[0].id;
  const doctor=(await db.query('SELECT id FROM doctors LIMIT 1')).rows[0].id;
  const patient=await createPatient(db,{name:'OPD address test patient'});
  const visit=await createVisit(db,{clinic_address_id:'munshipuliya',patient_id:patient.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:40000,payment_status:'unpaid'},user);
  await assert.rejects(()=>invoiceFromVisit(db,visit.id,{},user),/select.*address/i);
  const first=await invoiceFromVisit(db,visit.id,{clinic_address_id:'priyadarshini'},user);
  const repeat=await invoiceFromVisit(db,visit.id,{clinic_address_id:'munshipuliya'},user);
  assert.equal(first.invoice.clinic_address,addresses.priyadarshini);
  assert.equal(repeat.created,false);
  assert.equal(repeat.invoice.clinic_address,addresses.priyadarshini);
 }finally{await db.close();}
});
