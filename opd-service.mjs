import { randomUUID } from 'node:crypto';
import { AppError, invalid, string, isUuid, validateVisit, consultationTotal } from './opd.mjs';
import { numbered, audit, getInvoice, insertInvoice } from './billing.mjs';
import { CLINIC_ADDRESSES } from './public/clinic-addresses.js';
import {insertPatient} from './patients.mjs';
export {findPatients,createPatient} from './patients.mjs';
const searchTerm = value => '%'+string(value,100).replace(/[\\%_]/g,'\\$&')+'%';
const visitSelect = `SELECT v.*,to_char(v.opd_date,'YYYY-MM-DD') AS opd_date,p.name AS patient_name,p.patient_uid,p.mobile,p.age,p.gender,p.address,d.name AS doctor_name,i.id AS invoice_id,i.invoice_number
 FROM opd_visits v JOIN patients p ON p.id=v.patient_id JOIN doctors d ON d.id=v.doctor_id LEFT JOIN invoices i ON i.opd_visit_id=v.id`;
export async function getVisit(db,id) {
  if (!isUuid(id)) throw new AppError('OPD visit not found',404);
  const visit=(await db.query(visitSelect+' WHERE v.id=$1',[id])).rows[0];
  if (!visit) throw new AppError('OPD visit not found',404);
  return {...visit,consultation_total_paise:consultationTotal(visit.consultation_fee_paise,visit.discount_bps,visit.tax_rate_bps),invoice:visit.invoice_id?await getInvoice(db,visit.invoice_id):null};
}
export async function listVisits(db,q='') {
  return (await db.query(visitSelect+` WHERE p.name ILIKE $1 OR p.patient_uid ILIKE $1 OR p.mobile ILIKE $1 OR v.opd_number ILIKE $1 OR d.name ILIKE $1 OR v.illness_text ILIKE $1 ORDER BY v.visited_at DESC,v.opd_sequence DESC LIMIT 100`,[searchTerm(q)])).rows;
}
export async function createVisit(db,input,user_id) {
  const clinic=CLINIC_ADDRESSES.find(address=>address.id===input.clinic_address_id);
  if(!clinic)invalid('clinic_address_id','Select a clinic address');
  const v=validateVisit(input);
  return db.transaction(async tx => {
    const doctor=(await tx.query('SELECT id FROM doctors WHERE id=$1 AND active=true FOR SHARE',[v.doctor_id])).rows[0];
    if (!doctor) invalid('doctor_id','Select an active doctor');
    let patient;
    if (input.patient_id) {
      if (!isUuid(input.patient_id)) invalid('patient_id','Select an existing patient');
      patient=(await tx.query('SELECT * FROM patients WHERE id=$1',[input.patient_id])).rows[0];
      if (!patient) invalid('patient_id','Patient not found');
    } else { patient=await insertPatient(tx,input.patient); }
    const id=randomUUID(), seq=(await tx.query("SELECT nextval('opd_number_seq') AS n")).rows[0].n;
    const daily=(await tx.query(`INSERT INTO opd_daily_counters(opd_date,last_number)
      VALUES(($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,1)
      ON CONFLICT(opd_date) DO UPDATE SET last_number=opd_daily_counters.last_number+1
      RETURNING to_char(opd_date,'YYYY-MM-DD') AS opd_date,last_number`,[v.visited_at])).rows[0];
    await tx.query('INSERT INTO opd_visits(id,opd_sequence,opd_number,patient_id,doctor_id,illness_code,illness_text,consultation_fee_paise,payment_status,payment_mode,note,visited_at,created_by,created_at,discount_bps,tax_rate_bps,clinic_address,opd_date,daily_opd_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',[id,seq,numbered('OPD-',seq),patient.id,v.doctor_id,v.illness_code,v.illness_text,v.consultation_fee_paise,v.payment_status,v.payment_mode,v.note,v.visited_at,user_id,new Date().toISOString(),v.discount_bps,v.tax_rate_bps,clinic.address,daily.opd_date,daily.last_number]);
    await audit(tx,'opd_created',{opd_visit_id:id,user_id,details:JSON.stringify({payment_status:v.payment_status,consultation_fee_paise:v.consultation_fee_paise})});
    return getVisit(tx,id);
  });
}
export async function invoiceFromVisit(db,id,input,user_id) {
  if (!isUuid(id)) throw new AppError('OPD visit not found',404);
  return db.transaction(async tx => {
    if (!(await tx.query('SELECT id FROM opd_visits WHERE id=$1 FOR UPDATE',[id])).rows.length) throw new AppError('OPD visit not found',404);
    const visit=await getVisit(tx,id);
    if (visit.invoice) return {invoice:visit.invoice,created:false};
    const consultation={type:'Service',description:`Consultation - ${visit.doctor_name}`,quantity:1,unit_price_paise:visit.consultation_fee_paise};
    const items=input.items ?? [consultation];
    // The saved consultation is immutable. Extra charges may be added below it.
    const first=items?.[0];
    if (!Array.isArray(items)||first?.type!=='Service'||first?.quantity!==1||first?.unit_price_paise!==consultation.unit_price_paise||first?.description!==consultation.description) invalid('items','Keep the saved consultation charge unchanged');
    const invoice=await insertInvoice(tx,{patient_name:visit.patient_name,age:visit.age,gender:visit.gender,patient_mobile:visit.mobile,patient_address:visit.address,items,payment_mode:visit.payment_mode || 'UNPAID',paid_paise:visit.payment_status==='paid'?visit.consultation_total_paise:0,clinic_address_id:input.clinic_address_id},{patient_id:visit.patient_id,opd_visit_id:id,registration:visit.patient_uid,user_id,consultation:visit});
    await audit(tx,'invoice_linked',{invoice_id:invoice.id,opd_visit_id:id,user_id,details:'OPD consultation linked to invoice'});
    return {invoice,created:true};
  });
}
