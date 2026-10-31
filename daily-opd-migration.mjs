import {readFile} from 'node:fs/promises';
export const dailyOpdSchema=()=>readFile(new URL('./migrations/2026-11-01-daily-opd.sql',import.meta.url),'utf8');

export async function migrateDailyOpd(db) {
  const sql=await dailyOpdSchema();
  return db.transaction(async tx=>{
    await tx.exec('SET LOCAL lock_timeout = \'10s\'');
    await tx.exec('LOCK TABLE patients,opd_visits,invoices,invoice_items,payments,payment_adjustments,audit_log,medicines IN SHARE ROW EXCLUSIVE MODE');
    async function fingerprint() {
      const result={};
      for(const table of ['patients','opd_visits','invoices','invoice_items','payments','payment_adjustments','audit_log','medicines']) {
        const projection=table==='opd_visits'?"to_jsonb(t)-'opd_date'-'daily_opd_number'":'to_jsonb(t)';
        result[table]=(await tx.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_data::text,',' ORDER BY row_data::text),'')) AS digest FROM (SELECT ${projection} AS row_data FROM ${table} t) original`)).rows[0];
      }
      return result;
    }
    const before=await fingerprint();
    await tx.exec(sql);
    const after=await fingerprint();
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Original records changed; rolling back daily OPD migration');
    return {preserved:true,counts:Object.fromEntries(Object.entries(after).map(([table,value])=>[table,value.count]))};
  });
}
