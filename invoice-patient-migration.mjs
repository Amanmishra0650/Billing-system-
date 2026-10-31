import {readFile} from 'node:fs/promises';
export async function migrateInvoicePatients(db) {
  const sql=await readFile(new URL('./migrations/2026-11-01-invoice-patient-snapshots.sql',import.meta.url),'utf8');
  return db.transaction(async tx=>{
    await tx.exec("SET LOCAL lock_timeout='10s'");
    await tx.exec('LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE');
    const fingerprint=async()=>(await tx.query("SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_data::text,',' ORDER BY row_data::text),'')) AS digest FROM (SELECT to_jsonb(i)-'patient_mobile'-'patient_address' AS row_data FROM invoices i) original")).rows[0];
    const before=await fingerprint();await tx.exec(sql);const after=await fingerprint();
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Invoice snapshots changed; migration rolled back');
    return {preserved:true,invoices:after.count};
  });
}
