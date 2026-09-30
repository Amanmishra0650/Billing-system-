import { DatabaseSync } from 'node:sqlite';
import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { normalizeItems } from './items.mjs';

const tables=['users','invoices','payments','payment_adjustments','audit_log'];
const invoiceColumns=['id','invoice_number','created_at','patient_name','age','gender','registration','payment_mode','paid_paise','tax_rate_bps','subtotal_paise','cgst_paise','sgst_paise','total_paise','voided_at','void_reason'];
const totals = rows => Object.fromEntries(['subtotal_paise','cgst_paise','sgst_paise','total_paise','paid_paise'].map(key=>[key,rows.reduce((sum,row)=>sum+row[key],0)]));
export async function migrateSqlite(db,sourcePath,backupDirectory='backups') {
  const source=resolve(sourcePath), directory=resolve(backupDirectory);
  await mkdir(directory,{recursive:true,mode:0o700});
  const backup=resolve(directory,`pre-postgres-${Date.now()}-${randomUUID()}.sqlite`);
  const live=new DatabaseSync(source,{readOnly:true});
  try { live.prepare('VACUUM INTO ?').run(backup); } finally { live.close(); }
  await chmod(backup,0o600);
  const snapshot=new DatabaseSync(backup,{readOnly:true});
  let records;
  try {
    const existing=new Set(snapshot.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
    if(!existing.has('users')||!existing.has('invoices')) throw Error('Source is not a billing database');
    records=Object.fromEntries(tables.map(table=>[table,existing.has(table)?snapshot.prepare(`SELECT * FROM ${table} ORDER BY id`).all():[]]));
  } finally { snapshot.close(); }
  const items=records.invoices.flatMap(row=>normalizeItems(JSON.parse(row.items_json)).map((item,position)=>({invoice_id:row.id,position,...item})));
  records.invoices=records.invoices.map(row=>Object.fromEntries(invoiceColumns.map(key=>[key,row[key]??null])));
  return db.transaction(async tx => {
    await tx.exec('LOCK TABLE users,patients,opd_visits,invoices,invoice_items,payments,payment_adjustments,audit_log,sessions IN EXCLUSIVE MODE');
    for (const table of [...tables,'patients','opd_visits','invoice_items','sessions']) {
      if ((await tx.query(`SELECT 1 FROM ${table} LIMIT 1`)).rows.length) throw Error('Migration requires an empty destination. Existing records were not overwritten.');
    }
    async function insert(table,row) {
      const keys=Object.keys(row);
      await tx.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
    }
    for (const table of tables) {
      for (const row of records[table]) await insert(table,row);
      if(table==='invoices') for(const item of items) await insert('invoice_items',item);
    }
    for (const table of tables) {
      const sourceRows=records[table], columns=sourceRows.length?Object.keys(sourceRows[0]).join(','):'id';
      const destination=(await tx.query(`SELECT ${columns} FROM ${table} ORDER BY id`)).rows;
      if(!isDeepStrictEqual(destination,sourceRows.map(row=>({...row})))) throw Error(`Verification failed for ${table}; import rolled back`);
    }
    const destinationItems=(await tx.query('SELECT invoice_id,position,type,description,quantity,unit_price_paise,amount_paise FROM invoice_items ORDER BY invoice_id,position')).rows;
    if(!isDeepStrictEqual(destinationItems,items)) throw Error('Invoice item verification failed; import rolled back');
    const expected=totals(records.invoices), actual=totals((await tx.query('SELECT * FROM invoices')).rows);
    if(!isDeepStrictEqual(expected,actual)) throw Error('Financial totals do not match; import rolled back');
    for(const table of tables) {
      const max=Math.max(0,...records[table].map(row=>row.id));
      await tx.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),$1,$2)`,[Math.max(1,max),max>0]);
    }
    const uidMax=records.invoices.reduce((max,row)=>{const match=row.registration?.match(/^YPC-UID-(\d+)$/);return Math.max(max,match?Number(match[1]):0);},0);
    await tx.query("SELECT setval('patient_uid_seq',$1,$2)",[Math.max(1,uidMax),uidMax>0]);
    return {backup,counts:Object.fromEntries(tables.map(table=>[table,records[table].length])),invoice_items:items.length,totals:expected};
  });
}
