import {readFile} from 'node:fs/promises';
export const uhidCounterSchema=()=>readFile(new URL('./migrations/2026-11-01-uhid-counter.sql',import.meta.url),'utf8');
export async function migrateUhidCounter(db) {
  const sql=await uhidCounterSchema();
  return db.transaction(async tx=>{
    await tx.exec("SET LOCAL lock_timeout='10s'");
    await tx.exec('LOCK TABLE patients,invoices IN SHARE ROW EXCLUSIVE MODE');
    const fingerprint=async()=>(await tx.query("SELECT md5(COALESCE(string_agg(row_data::text,',' ORDER BY row_data::text),'')) AS digest FROM (SELECT jsonb_build_object('table','patients','row',to_jsonb(p)) AS row_data FROM patients p UNION ALL SELECT jsonb_build_object('table','invoices','row',to_jsonb(i)) FROM invoices i) original")).rows[0].digest;
    const before=await fingerprint();await tx.exec(sql);
    if(await fingerprint()!==before)throw Error('Existing identities changed; UHID migration rolled back');
    return {preserved:true,nextUhid:(await tx.query('SELECT last_value+1 AS n FROM patient_uhid_counter WHERE singleton')).rows[0].n};
  });
}
