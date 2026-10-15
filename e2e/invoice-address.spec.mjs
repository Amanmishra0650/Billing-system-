import {test,expect} from '@playwright/test';
import http from 'node:http';
import {createDatabase} from '../database.mjs';
import {seedAdmin} from '../auth.mjs';
import {createHandler} from '../handler.mjs';
let db,server,base;
test.beforeAll(async()=>{
 db=await createDatabase({connectionString:'',dataDir:'memory://'});
 await seedAdmin(db,'test','test-password-only');
 server=http.createServer(createHandler(db));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(db)await db.close();
});
for(const clinic of [
 {id:'munshipuliya',label:'Munshipuliya',text:'Munshipuliya, Lucknow, Uttar Pradesh',mobile:false},
 {id:'priyadarshini',label:'Priyadarshini Yojna',text:'1/26, Sector-c, Priyadarshini Yojna, Near Kiran Gas Service, Faizullahganj Road, Sitapur Road, Puraniya Tiraha, Lucknow.',mobile:true},
]){
 test(`required ${clinic.label} address selection survives history and PDF printing`,async({page},testInfo)=>{
  if(clinic.mobile)await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  await page.getByLabel('Username').fill('test');await page.getByLabel('Password').fill('test-password-only');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const form=page.locator('#invoice-form'),name=`Address browser patient ${clinic.id}`;
  await form.locator('[name=patient_name]').fill(name);
  await form.locator('.item-type').first().selectOption('Service');
  await form.locator('.description').first().fill('Synthetic consultation');
  await form.locator('.unit-price').first().fill('100');
  const before=(await db.query('SELECT count(*)::int AS n FROM invoices')).rows[0].n;
  await form.getByRole('button',{name:'Save invoice',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Select invoice address',exact:true});
  await expect(dialog).toBeVisible();await expect(dialog.getByRole('radio')).toHaveCount(2);
  await expect(dialog.locator('input:checked')).toHaveCount(0);
  const box=await dialog.boundingBox();expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await dialog.getByRole('button',{name:'Save invoice',exact:true}).click();
  await expect(dialog).toBeVisible();
  expect((await db.query('SELECT count(*)::int AS n FROM invoices')).rows[0].n).toBe(before);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(form.locator('[name=patient_name]')).toHaveValue(name);
  await form.getByRole('button',{name:'Save invoice',exact:true}).click();
  await dialog.getByRole('radio',{name:new RegExp(clinic.label)}).check();
  await page.screenshot({path:testInfo.outputPath('address-popup.png'),fullPage:true});
  await dialog.getByRole('button',{name:'Save invoice',exact:true}).click();
  const paper=page.locator('#invoice-paper');
  await expect(paper).toBeVisible();await expect(paper.locator('.invoice-heading')).toContainText(clinic.text);
  const saved=(await db.query('SELECT clinic_address FROM invoices WHERE patient_name=$1',[name])).rows[0];
  expect(saved.clinic_address).toBe(clinic.text);
  await page.reload();await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('#history-tab').click();await page.locator('#search').fill(name);
  await expect(page.locator('#rows tr')).toHaveCount(1);await page.locator('#rows button.open').click();
  await expect(paper.locator('.invoice-heading')).toContainText(clinic.text);
  await page.emulateMedia({media:'print'});
  await expect(dialog).toBeHidden();
  await page.screenshot({path:testInfo.outputPath('address-invoice-print.png'),fullPage:true});
  await page.pdf({path:testInfo.outputPath('address-invoice.pdf'),format:'A4',printBackground:true});
 });
}
