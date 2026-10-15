import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../database.mjs';
import { createMedicine,updateMedicine,setMedicineStatus } from '../medicines.mjs';
import { insertInvoice,getInvoice } from '../billing.mjs';
import { invoiceTotals } from '../public/invoice-totals.js';
import { seedAdmin } from '../auth.mjs';
import { createPatient,createVisit,invoiceFromVisit } from '../opd-service.mjs';

const patient={clinic_address_id:'munshipuliya',patient_name:'Synthetic patient',payment_mode:'CASH',paid_paise:0};
test('medicine invoices snapshot server values and survive master edits and deactivation',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try{
    const m=await createMedicine(db,{name:'Original Tablet',selling_price:100,tax_percentage:5});
    const invoice=await db.transaction(tx=>insertInvoice(tx,{...patient,items:[{type:'Medicine',medicine_id:m.id,quantity:2}]}));
    assert.equal(invoice.subtotal_paise,20000);assert.equal(invoice.total_paise,21000);
    assert.equal(invoice.cgst_paise+invoice.sgst_paise,1000);
    const item=invoice.items[0];assert.equal(item.medicine_id,m.id);assert.equal(item.medicine_name,'Original Tablet');
    assert.equal(item.description,'Original Tablet');assert.equal(item.unit_price_paise,10000);assert.equal(Number(item.tax_percentage),5);assert.equal(item.tax_amount_paise,1000);assert.equal(item.final_amount_paise,21000);
    await updateMedicine(db,m.id,{name:'Renamed Tablet',selling_price:200,tax_percentage:12,is_active:true});
    assert.deepEqual((await getInvoice(db,invoice.id)).items,invoice.items);
    const next=await db.transaction(tx=>insertInvoice(tx,{...patient,items:[{type:'Medicine',medicine_id:m.id,quantity:1}]}));
    assert.equal(next.items[0].medicine_name,'Renamed Tablet');assert.equal(next.total_paise,22400);
    await setMedicineStatus(db,m.id,{is_active:false});
    assert.deepEqual((await getInvoice(db,invoice.id)).items,invoice.items);
    await assert.rejects(()=>db.transaction(tx=>insertInvoice(tx,{...patient,items:[{type:'Medicine',medicine_id:m.id,quantity:1}]})),/active medicine/i);
  }finally{await db.close();}
});
test('medicine issuance rejects missing identity, forged quote, stale price/tax/name, and bad quantity',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try{
    const m=await createMedicine(db,{name:'Tablet',selling_price:100,tax_percentage:5});
    const issue=item=>db.transaction(tx=>insertInvoice(tx,{...patient,items:[{type:'Medicine',...item}]}));
    await assert.rejects(()=>issue({description:'Fake',quantity:1,unit_price_paise:1}),/medicine/i);
    await assert.rejects(()=>issue({medicine_id:'invalid',quantity:1}),/medicine/i);
    for(const type of [' Medicine ','Medicine\t'])await assert.rejects(()=>issue({type,description:'Bypass',unit_price_paise:10000,quantity:1}),/medicine/i);
    for(const type of [null,1,{},[]])await assert.rejects(()=>issue({type,description:'Bypass',unit_price_paise:10000,quantity:1}),/type/i);
    for(const quantity of [0,1.5,null,'2',10001]) await assert.rejects(()=>issue({medicine_id:m.id,quantity}),/quantity/i);
    await assert.rejects(()=>db.transaction(tx=>insertInvoice(tx,{...patient,items:[{type:'Medicine',medicine_id:m.id,quantity:1},{type:'Medicine',medicine_id:m.id,quantity:1}]})),/duplicate|already added|only once/i);
    for(const quote of [{unit_price_paise:1},{tax_percentage:0},{medicine_name:'Fake'},{description:'Fake'}]) await assert.rejects(()=>issue({medicine_id:m.id,quantity:1,...quote}),/changed|refresh|reselect/i);
    const saved=await issue({medicine_id:m.id,quantity:1,unit_price_paise:10000,tax_percentage:5,medicine_name:'Tablet',amount_paise:1,final_amount_paise:1});
    assert.equal(saved.total_paise,10500,'client amounts are ignored');
    await updateMedicine(db,m.id,{name:'Tablet',selling_price:110,tax_percentage:5});
    await assert.rejects(()=>issue({medicine_id:m.id,quantity:1,unit_price_paise:10000}),/changed|refresh|reselect/i);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM invoices')).rows[0].n,1);
  }finally{await db.close();}
});
test('mixed medicine taxes preserve service rounding and OPD consultation discounts',()=>{
  const medicine={type:'Medicine',medicine_id:'id',quantity:1,unit_price_paise:10000,amount_paise:10000,tax_percentage:5};
  const service={type:'Service',quantity:1,unit_price_paise:10000,amount_paise:10000};
  assert.equal(invoiceTotals([medicine,service]).total_paise,22300);
  assert.equal(invoiceTotals([service]).total_paise,11800);
  const consultation={consultation_fee_paise:50000,discount_bps:1000,tax_rate_bps:0};
  const result=invoiceTotals([{...service,unit_price_paise:50000,amount_paise:50000},medicine],consultation);
  assert.equal(result.total_paise,55500);assert.equal(result.discount_paise,5000);assert.equal(result.cgst_paise+result.sgst_paise,500);
  const odd=invoiceTotals([{...medicine,unit_price_paise:1,amount_paise:1,tax_percentage:100}]);
  assert.equal(odd.total_paise,2);assert.equal(odd.cgst_paise+odd.sgst_paise,1);
});

test('persisted mixed OPD invoice keeps consultation payment and medicine tax snapshots',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try {
    await seedAdmin(db,'test','test-password-only');
    const user=(await db.query('SELECT id FROM users LIMIT 1')).rows[0].id;
    const doctor=(await db.query('SELECT id,name FROM doctors LIMIT 1')).rows[0];
    const person=await createPatient(db,{name:'Synthetic medicine OPD patient'});
    const visit=await createVisit(db,{clinic_address_id:'munshipuliya',patient_id:person.id,doctor_id:doctor.id,illness_code:'piles',consultation_fee_paise:50000,discount_percent:10,payment_status:'paid',payment_mode:'CASH'},user);
    const m=await createMedicine(db,{name:'OPD Tablet',selling_price:100,tax_percentage:5});
    const {invoice}=await invoiceFromVisit(db,visit.id,{clinic_address_id:'munshipuliya',items:[{type:'Service',description:`Consultation - ${doctor.name}`,quantity:1,unit_price_paise:50000},{type:'Medicine',medicine_id:m.id,quantity:2},{type:'Treatment',description:'Extra treatment',quantity:1,unit_price_paise:10000}]},user);
    assert.equal(invoice.total_paise,77800);assert.equal(invoice.received_paise,45000);assert.equal(invoice.balance_paise,32800);
    assert.equal(invoice.discount_paise,5000);assert.equal(invoice.items[1].final_amount_paise,21000);
    await updateMedicine(db,m.id,{name:'Changed OPD Tablet',selling_price:300,tax_percentage:0});
    const duplicate=await invoiceFromVisit(db,visit.id,{},user);
    assert.equal(duplicate.created,false);assert.deepEqual(duplicate.invoice.items,invoice.items);
  }finally{await db.close();}
});
