import { normalizeItems } from './items.mjs';
import { AppError, invalid, string, PAYMENT_MODES } from './opd.mjs';
export const numbered = (prefix,id) => `${prefix}${String(id).padStart(6,'0')}`;
export async function nextUid(tx) { return numbered('YPC-UID-',(await tx.query("SELECT nextval('patient_uid_seq') AS n")).rows[0].n); }
export async function audit(tx,action,{invoice_id=null,opd_visit_id=null,user_id=null,details=''}={}) {
  await tx.query('INSERT INTO audit_log(invoice_id,opd_visit_id,user_id,action,details,created_at) VALUES($1,$2,$3,$4,$5,$6)',[invoice_id,opd_visit_id,user_id,action,details,new Date().toISOString()]);
}
export function validateInvoice(input) {
  const patient_name=string(input.patient_name,100), age=input.age == null ? '' : String(input.age).trim(), gender=string(input.gender,30), payment_mode=string(input.payment_mode,40);
  if (!patient_name) invalid('patient_name','Patient name is required');
  if (age && (!/^\d{1,3}$/.test(age)||Number(age)>120)) invalid('age','Enter a valid age');
  if (!PAYMENT_MODES.includes(payment_mode) && payment_mode !== 'UNPAID') invalid('payment_mode','Select a valid payment mode');
  let items;
  try { items=normalizeItems(input.items); } catch (error) { invalid('items',error.message); }
  const subtotal_paise=items.reduce((sum,x)=>sum+x.amount_paise,0), tax_rate_bps=900;
  const cgst_paise=Math.round(subtotal_paise*tax_rate_bps/10000), sgst_paise=cgst_paise, total_paise=subtotal_paise+cgst_paise+sgst_paise;
  if (!Number.isSafeInteger(total_paise)) invalid('items','Invoice total is too large');
  const paid_paise=input.paid_paise;
  if (!Number.isSafeInteger(paid_paise)||paid_paise<0||paid_paise>total_paise) invalid('paid_paise','Paid amount must be between zero and the total');
  return {patient_name,age,gender,payment_mode,paid_paise,tax_rate_bps,subtotal_paise,cgst_paise,sgst_paise,total_paise,items};
}
export async function getInvoice(db,id,{lock=false}={}) {
  const row=(await db.query(`SELECT * FROM invoices WHERE id=$1${lock?' FOR UPDATE':''}`,[id])).rows[0];
  if (!row) throw new AppError('Invoice not found',404);
  const items=(await db.query('SELECT type,description,quantity,unit_price_paise,amount_paise FROM invoice_items WHERE invoice_id=$1 ORDER BY position',[id])).rows;
  // One statement gives both ledgers the same PostgreSQL snapshot, including
  // reads outside a write transaction (OPD details and duplicate link responses).
  const {payments,payment_adjustments}=(await db.query(`SELECT
    COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM payments p WHERE p.invoice_id=$1),'[]'::jsonb) AS payments,
    COALESCE((SELECT jsonb_agg(a ORDER BY a.id) FROM payment_adjustments a WHERE a.invoice_id=$1),'[]'::jsonb) AS payment_adjustments`,[id])).rows[0];
  const received_paise=row.paid_paise+payments.reduce((s,p)=>s+p.amount_paise,0)+payment_adjustments.reduce((s,p)=>s+p.amount_paise,0);
  const opd=row.opd_visit_id ? (await db.query('SELECT opd_number FROM opd_visits WHERE id=$1',[row.opd_visit_id])).rows[0] : null;
  return {...row,items,payments,payment_adjustments,received_paise,balance_paise:row.total_paise-received_paise,opd_number:opd?.opd_number || null};
}
export async function insertInvoice(tx,input,{patient_id=null,opd_visit_id=null,registration=null,user_id=null}={}) {
  const v=validateInvoice(input);
  registration ||= await nextUid(tx);
  const columns=['created_at','patient_name','age','gender','registration','payment_mode','paid_paise','tax_rate_bps','subtotal_paise','cgst_paise','sgst_paise','total_paise','patient_id','opd_visit_id'];
  const values=[new Date().toISOString(),v.patient_name,v.age,v.gender,registration,v.payment_mode,v.paid_paise,v.tax_rate_bps,v.subtotal_paise,v.cgst_paise,v.sgst_paise,v.total_paise,patient_id,opd_visit_id];
  const row=(await tx.query(`INSERT INTO invoices(${columns.join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,values)).rows[0];
  await tx.query('UPDATE invoices SET invoice_number=$1 WHERE id=$2',[numbered('YPC-',row.id),row.id]);
  for (const [position,item] of v.items.entries()) await tx.query('INSERT INTO invoice_items(invoice_id,position,type,description,quantity,unit_price_paise,amount_paise) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,position,item.type,item.description,item.quantity,item.unit_price_paise,item.amount_paise]);
  await audit(tx,'created',{invoice_id:row.id,opd_visit_id,user_id,details:'Invoice issued'});
  return getInvoice(tx,row.id);
}
export async function listInvoices(db,search='') {
  return (await db.query(`SELECT i.*, i.paid_paise + COALESCE((SELECT SUM(amount_paise) FROM payments WHERE invoice_id=i.id),0)::bigint + COALESCE((SELECT SUM(amount_paise) FROM payment_adjustments WHERE invoice_id=i.id),0)::bigint AS received_paise
    FROM invoices i WHERE patient_name ILIKE $1 OR invoice_number ILIKE $1 OR registration ILIKE $1 ORDER BY id DESC LIMIT 100`,['%'+string(search,100).replace(/[\\%_]/g,'\\$&')+'%'])).rows;
}
export async function changeInvoice(db,id,action,data,user_id) {
  return db.transaction(async tx => {
    const current=await getInvoice(tx,id,{lock:true});
    if (current.voided_at) throw new AppError('Voided invoices cannot be changed',409);
    const now=new Date().toISOString();
    if (action === 'payments') {
      const amount=data.amount_paise, mode=string(data.mode,40), note=string(data.note,200);
      if (!Number.isSafeInteger(amount)||amount<=0||amount>current.balance_paise||!PAYMENT_MODES.includes(mode)) throw new AppError('Enter a valid amount and payment mode within the balance');
      await tx.query('INSERT INTO payments(invoice_id,amount_paise,mode,received_at,note) VALUES($1,$2,$3,$4,$5)',[id,amount,mode,now,note]);
      await audit(tx,'payment',{invoice_id:id,user_id,details:JSON.stringify({amount_paise:amount,mode})});
    } else if (action === 'payment-status') {
      if (!['paid','unpaid'].includes(data.status)) throw new AppError('Choose Paid or Unpaid');
      if (!current.total_paise && data.status==='unpaid') throw new AppError('A zero-total invoice has no amount due');
      const target=data.status==='paid'?current.total_paise:0, adjustment=target-current.received_paise;
      if (adjustment) {
        await tx.query('INSERT INTO payment_adjustments(invoice_id,amount_paise,status,created_at) VALUES($1,$2,$3,$4)',[id,adjustment,data.status,now]);
        await audit(tx,'payment_status',{invoice_id:id,user_id,details:JSON.stringify({status:data.status,previous_received_paise:current.received_paise,received_paise:target,adjustment_paise:adjustment})});
      }
    } else if (action === 'void') {
      const reason=string(data.reason,200);
      if (reason.length<5) invalid('reason','Enter a reason of at least five characters');
      if (current.received_paise>0) throw new AppError('Record a refund outside this app before voiding a paid invoice',409);
      await tx.query('UPDATE invoices SET voided_at=$1,void_reason=$2 WHERE id=$3',[now,reason,id]);
      await audit(tx,'voided',{invoice_id:id,user_id,details:reason});
    }
    return getInvoice(tx,id);
  });
}
