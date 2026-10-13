import { readFile } from 'node:fs/promises';
const source=new URL('./migrations/2026-10-13-medicines.sql',import.meta.url);
export const medicineSchema=()=>readFile(source,'utf8');

async function fingerprint(tx) {
  const tables=['users','patients','opd_visits','invoices','invoice_items','payments','payment_adjustments','audit_log'];
  const result={};
  for(const table of tables) {
    const projection=table==='invoice_items'
      ? 'invoice_id,position,type,description,quantity,unit_price_paise,amount_paise'
      : '*';
    // Identifiers are fixed above, never supplied by callers. No patient data is returned.
    result[table]=(await tx.query(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, ',' ORDER BY to_jsonb(t)::text),'')) AS digest FROM (SELECT ${projection} FROM ${table}) t`)).rows[0];
  }
  return result;
}
export async function migrateMedicines(db) {
  const schema=await medicineSchema();
  return db.transaction(async tx=>{
    await tx.exec('LOCK TABLE users,patients,opd_visits,invoices,invoice_items,payments,payment_adjustments,audit_log IN SHARE ROW EXCLUSIVE MODE');
    const before=await fingerprint(tx);
    await tx.exec(schema);
    const after=await fingerprint(tx);
    if(JSON.stringify(before)!==JSON.stringify(after)) throw Error('Existing records changed; medicine migration rolled back');
    return {preserved:true,counts:Object.fromEntries(Object.entries(after).map(([table,value])=>[table,value.count]))};
  });
}
