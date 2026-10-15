import { test,expect } from '@playwright/test';
import http from 'node:http';
import { createDatabase } from '../database.mjs';
import { createMedicine } from '../medicines.mjs';
import { seedAdmin } from '../auth.mjs';
import { createHandler } from '../handler.mjs';
let db,server,base,first,second;
test.beforeAll(async()=>{
  db=await createDatabase({connectionString:'',dataDir:'memory://'});await seedAdmin(db,'test','test-password-only');
  first=await createMedicine(db,{name:'Drawer Tablet A',selling_price:100,tax_percentage:5});
  second=await createMedicine(db,{name:'Drawer Tablet B',selling_price:50,tax_percentage:0});
  await createMedicine(db,{name:'Inactive Drawer Tablet',selling_price:10,is_active:false});
  server=http.createServer(createHandler(db));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(db)await db.close();});
async function login(page){await page.goto(base);await page.getByLabel('Username').fill('test');await page.getByLabel('Password').fill('test-password-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#workspace')).toBeVisible();}

test('drawer multi-selection stays synchronized and invoice saves/reopens with database snapshots',async({page},testInfo)=>{
  test.setTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await login(page);
  await page.locator('#invoice-form [name=patient_name]').fill('Drawer synthetic patient');
  await page.locator('#items .description').click();const drawer=page.getByRole('dialog',{name:'Select medicines',exact:true});await expect(drawer).toBeVisible();
  const desktop=await drawer.boundingBox();expect(Math.round(desktop.width)).toBe(520);expect(Math.round(desktop.x)).toBe(page.viewportSize().width-520);
  await expect(drawer.getByRole('checkbox')).toHaveCount(2);await expect(drawer).not.toContainText('Inactive Drawer Tablet');await expect(drawer).toContainText('100.00');
  await drawer.getByLabel('Search medicines').fill('Tablet B');await expect(drawer.getByRole('checkbox')).toHaveCount(1);await drawer.getByRole('checkbox',{name:'Drawer Tablet B',exact:true}).check();
  await drawer.getByLabel('Search medicines').fill('');await drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true}).check();
  await expect(page.locator('#items .item-row[data-medicine-id]')).toHaveCount(2);await drawer.getByRole('button',{name:'Close',exact:true}).click();
  const a=page.locator(`#items .item-row[data-medicine-id="${first.id}"]`),b=page.locator(`#items .item-row[data-medicine-id="${second.id}"]`);
  await expect(a.locator('.quantity')).toHaveValue('1');await expect(a.locator('.unit-price')).toHaveValue('100.00');await a.locator('.quantity').fill('3');await expect(a.locator('.line-total strong')).toContainText('300.00');await expect(page.locator('#subtotal')).toContainText('350.00');await expect(page.locator('#total')).toContainText('365.00');
  await a.locator('.description').click();await expect(drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true})).toBeChecked();await drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true}).check();await expect(page.locator('#items .item-row[data-medicine-id]')).toHaveCount(2);
  await drawer.getByRole('checkbox',{name:'Drawer Tablet B',exact:true}).uncheck();await expect(b).toHaveCount(0);await expect(page.locator('#total')).toContainText('315.00');await drawer.getByRole('button',{name:'Close medicine drawer',exact:true}).click();
  await a.getByRole('button',{name:'Remove charge'}).click();await page.locator('#items .description').click();await expect(drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true})).not.toBeChecked();
  await drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true}).check();await drawer.getByRole('checkbox',{name:'Drawer Tablet B',exact:true}).check();await drawer.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'+ Add charge',exact:true}).click();const blank=page.locator('#items .item-row').last();await blank.locator('.item-type').selectOption('Service');await blank.locator('.description').fill('Manual service');await blank.locator('.unit-price').fill('20');await expect(page.locator('#total')).toContainText('178.60');
  await page.locator('#items .item-row[data-medicine-id]').first().locator('.description').click();await page.screenshot({path:testInfo.outputPath('medicine-drawer-desktop.png'),fullPage:true});await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();
  await page.getByRole('button',{name:'Save invoice',exact:true}).click();await page.locator('#invoice-address-dialog').getByRole('radio',{name:/Munshipuliya/}).check();await page.locator('#invoice-address-dialog').getByRole('button',{name:'Save invoice',exact:true}).click();await expect(page.locator('#invoice-paper')).toContainText('Drawer Tablet A');await expect(page.locator('#invoice-paper')).toContainText('178.60');
  await page.getByRole('button',{name:'Invoice history',exact:true}).click();await page.locator('#rows .open').first().click();await expect(page.locator('#invoice-paper')).toContainText('Drawer Tablet B');await expect(page.locator('#invoice-paper')).toContainText('Manual service');
  expect((await db.query('SELECT COUNT(*)::int AS n FROM medicines')).rows[0].n).toBe(3);expect(errors).toEqual([]);
});

test('drawer handles loading, API retry, empty results, mobile width and focus restoration',async({page},testInfo)=>{
  await login(page);let release;const pending=new Promise(resolve=>release=resolve);
  await page.route('**/api/medicines?active=true',async route=>{await pending;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Catalogue temporarily unavailable'})});});
  const trigger=page.locator('#items .description');await trigger.click();const drawer=page.getByRole('dialog',{name:'Select medicines',exact:true});await expect(drawer).toContainText('Loading medicines');release();await expect(drawer).toContainText('Catalogue temporarily unavailable');await expect(drawer.getByRole('button',{name:'Retry'})).toBeVisible();
  await page.unroute('**/api/medicines?active=true');await drawer.getByRole('button',{name:'Retry'}).click();await expect(drawer.getByRole('checkbox')).toHaveCount(2);
  await drawer.getByLabel('Search medicines').fill('missing medicine');await expect(drawer).toContainText('No medicines match');await drawer.getByRole('button',{name:'Close',exact:true}).click();await expect(trigger).toBeFocused();
  await page.route('**/api/medicines?active=true',route=>route.fulfill({contentType:'application/json',body:'[]'}));await trigger.press('Enter');await expect(drawer).toContainText('No active medicines');await page.keyboard.press('Escape');await page.unroute('**/api/medicines?active=true');
  await page.setViewportSize({width:390,height:844});await trigger.click();await expect(drawer.getByRole('checkbox')).toHaveCount(2);const box=await drawer.boundingBox();expect(Math.round(box.width)).toBe(390);expect(Math.round(box.x)).toBe(0);await page.screenshot({path:testInfo.outputPath('medicine-drawer-mobile.png'),fullPage:true});
});

test('drawer respects the existing thirty-charge limit even when a blank medicine row exists',async({page})=>{
  await login(page);
  await page.evaluate(()=>{
    for(let i=0;i<30;i++){
      document.getElementById('add-item').click();const row=document.querySelector('#items .item-row:last-child');
      const type=row.querySelector('.item-type');type.value='Service';type.dispatchEvent(new Event('change',{bubbles:true}));
      row.querySelector('.description').value='Synthetic service '+i;row.querySelector('.unit-price').value='1';row.dispatchEvent(new Event('input',{bubbles:true}));
    }
  });
  await page.locator('#items .description').first().click();const drawer=page.getByRole('dialog',{name:'Select medicines',exact:true});
  await drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true}).click();await expect(drawer).toContainText('up to 30 charges');
  await expect(drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true})).not.toBeChecked();await expect(page.locator('#items .item-row[data-medicine-id]')).toHaveCount(0);
});

test('switching a selected medicine to a service clears selection and preserves manual entry',async({page})=>{
  await login(page);await page.locator('#items .description').click();const drawer=page.getByRole('dialog',{name:'Select medicines',exact:true});
  await drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true}).check();await drawer.getByRole('button',{name:'Close',exact:true}).click();
  const manual=page.locator('#items .item-row').first();await manual.locator('.item-type').selectOption('Service');await manual.locator('.description').fill('Manual replacement service');await manual.locator('.unit-price').fill('20');
  await page.getByRole('button',{name:'+ Add charge',exact:true}).click();await page.locator('#items .description').last().click();await expect(drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true})).not.toBeChecked();
  await drawer.getByRole('checkbox',{name:'Drawer Tablet A',exact:true}).check();await drawer.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('#items .item-row[data-medicine-id]')).toHaveCount(1);await expect(manual.locator('.description')).toHaveValue('Manual replacement service');await expect(page.locator('#total')).toContainText('128.60');
});

test('closing and reopening ignores an older active-medicine response',async({page})=>{
  await login(page);let release,firstRequest=true;const pending=new Promise(resolve=>release=resolve);
  await page.route('**/api/medicines?active=true',async route=>{
    if(!firstRequest){await route.continue();return;}
    firstRequest=false;await pending;await route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'obsolete',name:'Obsolete response',selling_price:'999',tax_percentage:0,is_active:true}])});
  });
  const trigger=page.locator('#items .description'),drawer=page.getByRole('dialog',{name:'Select medicines',exact:true});await trigger.click();await expect(drawer).toContainText('Loading medicines');await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();
  await trigger.click();await expect(drawer.getByRole('checkbox')).toHaveCount(2);
  const oldResponse=page.waitForResponse(r=>r.url().endsWith('/api/medicines?active=true'));release();await(await oldResponse).finished();
  await expect(drawer.getByRole('checkbox')).toHaveCount(2);await expect(drawer).not.toContainText('Obsolete response');await drawer.getByRole('button',{name:'Close',exact:true}).click();
});
