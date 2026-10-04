import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../database.mjs';
import { seedAdmin } from '../auth.mjs';
import { createPatient,createVisit,invoiceFromVisit,getVisit } from '../opd-service.mjs';
import { changeInvoice,getInvoice } from '../billing.mjs';
test('OPD invoice balance remains consistent when a payment and adjustment occur during its read',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try {
    await seedAdmin(db,'test','test-password-only');
    const user=(await db.query('SELECT id FROM users')).rows[0].id, doctor=(await db.query('SELECT id FROM doctors LIMIT 1')).rows[0].id;
    const patient=await createPatient(db,{name:'Synthetic patient'});
    const visit=await createVisit(db,{patient_id:patient.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:10000,payment_status:'unpaid'},user);
    const {invoice}=await invoiceFromVisit(db,visit.id,{},user);
    let injected=false;
    const reader={query:async(sql,args)=>{
      const result=await db.query(sql,args);
      if(!injected && /FROM payments/.test(sql)) {
        injected=true;
        await changeInvoice(db,invoice.id,'payments',{amount_paise:10000,mode:'CASH'},user);
        await changeInvoice(db,invoice.id,'payment-status',{status:'unpaid'},user);
      }
      return result;
    }};
    const observed=(await getVisit(reader,visit.id)).invoice;
    assert.equal(injected,true);
    assert.equal(observed.received_paise,0);assert.equal(observed.balance_paise,10000);
    assert.equal((await getInvoice(db,invoice.id)).received_paise,0);
  } finally {await db.close();}
});
