import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createDatabase } from '../database.mjs';
import { createHandler } from '../handler.mjs';
import { seedAdmin } from '../auth.mjs';
import { validateMedicine } from '../medicines.mjs';
import { migrateMedicines } from '../medicine-migration.mjs';

test('medicine validation rejects malformed values and keeps decimal precision', () => {
  assert.deepEqual(validateMedicine({name:'  Tablet A  ',selling_price:'100.25'}),{name:'Tablet A',selling_price:'100.25',tax_percentage:'0.00',is_active:true});
  assert.equal(validateMedicine({name:'Free sample',selling_price:0,tax_percentage:100,is_active:false}).selling_price,'0.00');
  for (const name of ['', '   ', null, 123, 'x'.repeat(141)]) assert.throws(()=>validateMedicine({name,selling_price:1}));
  for (const selling_price of ['',null,true,-1,Infinity,NaN,'abc','1.234',1000001,{},'1e3']) assert.throws(()=>validateMedicine({name:'A',selling_price}),/price/i);
  for (const tax_percentage of [null,true,-1,101,'1.234','abc',Infinity]) assert.throws(()=>validateMedicine({name:'A',selling_price:1,tax_percentage}),/tax/i);
  for (const is_active of ['true',1,null]) assert.throws(()=>validateMedicine({name:'A',selling_price:1,is_active}),/status/i);
});

test('authenticated medicine APIs support safe CRUD, search, duplicates, and status',async t=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  await seedAdmin(db,'test','test-password-only');
  const server=http.createServer(createHandler(db));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();});
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const request=async(path,method='GET',value)=>{
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:value===undefined?undefined:JSON.stringify(value)});
    return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')};
  };
  assert.equal((await request('/api/medicines')).status,401);
  cookie=(await request('/api/login','POST',{username:'test',password:'test-password-only'})).cookie.split(';')[0];
  const created=await request('/api/medicines','POST',{name:'Triphala',selling_price:'100.25',tax_percentage:5});
  assert.equal(created.status,201);const medicine=created.value;
  assert.equal(medicine.name,'Triphala');assert.equal(Number(medicine.selling_price),100.25);assert.equal(medicine.is_active,true);
  assert.equal((await request(`/api/medicines/${medicine.id}`)).value.name,'Triphala');
  const duplicate=await request('/api/medicines','POST',{name:' triphala ',selling_price:2});
  assert.equal(duplicate.status,409);assert.match(duplicate.value.fields.name,/already exists/i);
  const concurrent=await Promise.all([request('/api/medicines','POST',{name:'Race',selling_price:1}),request('/api/medicines','POST',{name:'RACE',selling_price:1})]);
  assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
  assert.equal((await request('/api/medicines?q=PHALA')).value.length,1);
  assert.equal((await request('/api/medicines?q=%25')).value.length,0,'search treats percent as literal');
  assert.equal((await request('/api/medicines?active=invalid')).status,400);
  assert.equal((await request(`/api/medicines/${medicine.id}`,'PUT',{name:'Triphala Plus',selling_price:120,tax_percentage:12,is_active:true})).status,200);
  assert.equal((await request(`/api/medicines/${medicine.id}`,'PUT',{name:'race',selling_price:1})).status,409);
  assert.equal((await request(`/api/medicines/${medicine.id}/status`,'PATCH',{is_active:false})).value.is_active,false);
  assert.equal((await request('/api/medicines?active=true&q=Triphala')).value.length,0);
  assert.equal((await request(`/api/medicines/${medicine.id}/status`,'PATCH',{is_active:'false'})).status,400);
  assert.equal((await request(`/api/medicines/${medicine.id}/status`,'PATCH',{is_active:true})).status,200);
  assert.equal((await request('/api/medicines/invalid')).status,404);
  assert.equal((await request('/api/medicines/11111111-1111-4111-8111-111111111111')).status,404);
  for(const value of [{name:'',selling_price:1},{name:'Bad',selling_price:-1},{name:'Bad',selling_price:1,tax_percentage:101}]) assert.equal((await request('/api/medicines','POST',value)).status,400);
  assert.equal((await request(`/api/medicines/${medicine.id}`,'DELETE')).status,404);
  assert.equal((await fetch(base+'/api/medicines',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://unrelated.example'},body:'{}'})).status,403);
});

test('medicine migration is additive and repeatable and keeps legacy invoice snapshots',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://',initialize:false});
  try {
    await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
    await db.query("INSERT INTO invoices(id,invoice_number,created_at,patient_name,registration,payment_mode,paid_paise,tax_rate_bps,subtotal_paise,cgst_paise,sgst_paise,total_paise) VALUES(1,'OLD-1','2026-01-01','Synthetic legacy','LEGACY','CASH',0,900,10000,900,900,11800)");
    await db.query("INSERT INTO invoice_items(invoice_id,position,type,description,quantity,unit_price_paise,amount_paise) VALUES(1,0,'Medicine','Legacy Tablet',1,10000,10000)");
    const before=(await db.query('SELECT * FROM invoices')).rows;
    const first=await migrateMedicines(db);const second=await migrateMedicines(db);
    assert.equal(first.preserved,true);assert.equal(second.preserved,true);
    assert.deepEqual((await db.query('SELECT * FROM invoices')).rows,before);
    const item=(await db.query('SELECT * FROM invoice_items')).rows[0];
    assert.equal(item.description,'Legacy Tablet');assert.equal(item.medicine_id,null);assert.equal(item.unit_price_paise,10000);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM medicines')).rows[0].n,0);
  }finally{await db.close();}
});
