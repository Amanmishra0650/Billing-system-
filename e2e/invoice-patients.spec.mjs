import {test,expect} from '@playwright/test';
import http from 'node:http';
import {createDatabase} from '../database.mjs';
import {createHandler} from '../handler.mjs';
import {seedAdmin} from '../auth.mjs';
import {createPatient,createVisit} from '../opd-service.mjs';
import {createMedicine} from '../medicines.mjs';
let db,server,base,first,second;
test.beforeAll(async()=>{
  db=await createDatabase({connectionString:'',dataDir:'memory://'});
  await seedAdmin(db,'test','test-password-only');
  first=await createPatient(db,{name:'Ritika',mobile:'9876543210',age:'24',gender:'Female',address:'First address'});
  second=await createPatient(db,{name:'Ritika',mobile:'8765432109',age:'38',gender:'Female',confirm_distinct_patient:true});
  const user=(await db.query('SELECT id FROM users LIMIT 1')).rows[0].id;
  const doctor=(await db.query('SELECT id FROM doctors LIMIT 1')).rows[0].id;
  await createVisit(db,{clinic_address_id:'munshipuliya',patient_id:first.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:40000,payment_status:'unpaid',visited_at:'2026-10-31T09:00:00Z'},user);
  await createMedicine(db,{name:'Search test medicine',selling_price:100});
  server=http.createServer(createHandler(db));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(db)await db.close();});
async function login(page){await page.goto(base);await page.getByLabel('Username').fill('test');await page.getByLabel('Password').fill('test-password-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#workspace')).toBeVisible();}
async function save(page){await page.getByRole('button',{name:'Save invoice',exact:true}).click();const dialog=page.locator('#invoice-address-dialog');await dialog.getByRole('radio',{name:/Munshipuliya/}).check();await dialog.getByRole('button',{name:'Save invoice',exact:true}).click();}
async function service(page){const row=page.locator('#items .item-row').first();await row.locator('.item-type').selectOption('Service');await row.locator('.description').fill('Test service');await row.locator('.unit-price').fill('100');}

test('compact header UHID search selects the same patient on desktop and mobile',async({page},testInfo)=>{
  await login(page);
  const search=page.getByRole('combobox',{name:'Search patient by UHID',exact:true});
  await expect(search).toBeVisible();
  const heading=await page.getByRole('heading',{name:'Patient Details',exact:true}).boundingBox();
  const box=await search.boundingBox();expect(box.x).toBeGreaterThan(heading.x+heading.width);
  await search.fill(first.patient_uid);
  await page.locator('#invoice-uhid-matches').getByRole('option').filter({hasText:first.patient_uid}).click();
  await expect(page.locator('#invoice-form [name=patient_name]')).toHaveValue(first.name);
  await expect(page.locator('#registration')).toHaveValue(first.patient_uid);
  await expect(page.locator('#invoice-form [name=mobile]')).toHaveValue(first.mobile);
  await page.screenshot({path:testInfo.outputPath('header-uhid-search.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(search).toBeVisible();
  await search.fill(second.patient_uid);await page.locator('#invoice-uhid-matches').getByRole('option').click();
  await expect(page.locator('#registration')).toHaveValue(second.patient_uid);
  const mobileBox=await search.boundingBox();expect(mobileBox.x+mobileBox.width).toBeLessThanOrEqual(390);
});

test('same-name selection autofills details, clears safely, and medicine invoice keeps UHID',async({page},testInfo)=>{
  await login(page);const form=page.locator('#invoice-form'),name=form.locator('[name=patient_name]');
  const searches=[];page.on('request',r=>{if(r.url().includes('/api/patients?'))searches.push(r.url());});
  await name.fill('R');await page.waitForTimeout(350);expect(searches).toHaveLength(0);
  await name.fill('Ri');await name.fill('Rit');await name.fill('Ritika');
  const matches=page.locator('#invoice-patient-matches');await expect(matches.getByRole('option')).toHaveCount(2);
  expect(searches).toHaveLength(1);await expect(form.locator('#registration')).toHaveValue('');
  await expect(matches).toContainText(first.patient_uid);await expect(matches).toContainText(second.patient_uid);await expect(matches).toContainText('24 Years');await expect(matches).toContainText('38 Years');await expect(matches).toContainText('31/10/2026');
  await matches.getByRole('option').filter({hasText:first.patient_uid}).click();
  await expect(form.locator('[name=mobile]')).toHaveValue(first.mobile);await expect(form.locator('[name=address]')).toHaveValue('First address');await expect(form.locator('[name=age]')).toHaveValue('24');
  await name.fill('Changed patient');await expect(form.locator('#registration')).toHaveValue('');await expect(form.locator('[name=mobile]')).toHaveValue('');
  await name.fill(second.patient_uid);await matches.getByRole('option').filter({hasText:second.patient_uid}).click();
  await expect(form.locator('[name=gender]')).toHaveValue('Female');await expect(form.locator('[name=age]')).toHaveValue('38');await expect(form.locator('#registration')).toHaveAttribute('readonly','');
  await expect(page.locator('#invoice-patient-selection')).toContainText('Existing Patient');
  const row=page.locator('#items .item-row').first();await row.locator('.description').press('Enter');
  const drawer=page.getByRole('dialog',{name:'Select medicines',exact:true});await drawer.getByRole('checkbox',{name:'Search test medicine',exact:true}).check();await drawer.getByRole('button',{name:'Close',exact:true}).click();
  await page.screenshot({path:testInfo.outputPath('selected-patient.png'),fullPage:true});
  await save(page);await expect(page.locator('#detail')).toBeVisible();await expect(page.locator('#invoice-paper')).toContainText(second.patient_uid);
  const invoice=(await db.query('SELECT * FROM invoices ORDER BY id DESC LIMIT 1')).rows[0];expect(invoice.patient_id).toBe(second.id);expect(invoice.patient_mobile).toBe(second.mobile);
  expect((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n).toBe(2);expect((await db.query('SELECT count(*)::int AS n FROM opd_visits')).rows[0].n).toBe(1);
});

test('new patient save failure leaves no profile and confirmed edits preserve old snapshots',async({page},testInfo)=>{
  await login(page);const form=page.locator('#invoice-form'),name=form.locator('[name=patient_name]');
  await name.fill('Fresh invoice patient');await page.getByRole('button',{name:'Create new patient: Fresh invoice patient',exact:true}).click();
  await expect(page.locator('#invoice-patient-selection')).toContainText('New Patient');await expect(form.locator('#registration')).toHaveValue('');
  await service(page);
  await page.route('**/api/invoices',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Simulated invoice failure'})}));
  await save(page);await expect(page.locator('#form-message')).toContainText('Simulated invoice failure');
  expect((await db.query("SELECT count(*)::int AS n FROM patients WHERE name='Fresh invoice patient'")).rows[0].n).toBe(0);
  await page.unroute('**/api/invoices');await save(page);await expect(page.locator('#detail')).toBeVisible();
  const created=(await db.query("SELECT * FROM patients WHERE name='Fresh invoice patient'")).rows[0];await expect(page.locator('#invoice-paper')).toContainText(created.patient_uid);
  await page.getByRole('button',{name:'New invoice',exact:true}).click();await name.fill(created.patient_uid);await page.locator('#invoice-patient-matches').getByRole('option').click();
  await form.locator('[name=address]').fill('Updated address');await service(page);
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('patient master');await dialog.dismiss();});
  await page.getByRole('button',{name:'Save invoice',exact:true}).click();await expect(page.locator('#form-message')).toContainText('cancelled');
  expect((await db.query('SELECT address FROM patients WHERE id=$1',[created.id])).rows[0].address).toBe('');
  page.once('dialog',dialog=>dialog.accept());await save(page);await expect(page.locator('#detail')).toBeVisible();
  const invoices=(await db.query('SELECT patient_address FROM invoices WHERE patient_id=$1 ORDER BY id',[created.id])).rows;
  expect(invoices.map(i=>i.patient_address)).toEqual(['','Updated address']);await expect(page.locator('#invoice-paper')).toContainText('Updated address');
  await page.emulateMedia({media:'print'});await page.pdf({path:testInfo.outputPath('patient-invoice.pdf'),format:'A4',printBackground:true});
});

test('a different person may share a name only after explicit distinct-patient confirmation',async({page})=>{
  await login(page);const form=page.locator('#invoice-form');
  await form.locator('[name=patient_name]').fill('Ritika');
  await page.getByRole('button',{name:'Create different patient: Ritika',exact:true}).click();
  await form.locator('[name=mobile]').fill('7654321098');await form.locator('[name=age]').fill('45');
  await service(page);await page.getByRole('button',{name:'Save invoice',exact:true}).click();
  await expect(page.locator('#form-message')).toContainText('different person');
  await page.getByRole('checkbox',{name:'I confirm this is a different person',exact:true}).check();
  await save(page);await expect(page.locator('#detail')).toBeVisible();
  const matches=(await db.query("SELECT * FROM patients WHERE name='Ritika' ORDER BY uid_sequence")).rows;
  expect(matches).toHaveLength(3);expect(matches[2].mobile).toBe('7654321098');
  expect(new Set(matches.map(p=>p.patient_uid)).size).toBe(3);
});
