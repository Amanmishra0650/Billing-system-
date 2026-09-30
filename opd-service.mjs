import { randomUUID } from 'node:crypto';
import { AppError, invalid, string, isUuid, validatePatient, validateVisit, consultationTotal } from './opd.mjs';
import { numbered, audit, getInvoice, insertInvoice } from './billing.mjs';
const searchTerm = value => '%'+string(value,100).replace(/[\\%_]/g,'\\$&')+'%';
export async function findPatients(db,q='') {
  if (!string(q)) return [];
  return (await db.query('SELECT * FROM patients WHERE name ILIKE $1 OR patient_uid ILIKE $1 OR mobile ILIKE $1 ORDER BY uid_sequence DESC LIMIT 20',[searchTerm(q)])).rows;
}
async function insertPatient(tx,input) {
  const p=validatePatient(input);
  // Serialize duplicate checks so simultaneous new registrations see each other.
  await tx.exec('LOCK TABLE patients IN SHARE ROW EXCLUSIVE MODE');
  const matches=(await tx.query("SELECT * FROM patients WHERE lower(name)=lower($1) OR ($2<>'' AND regexp_replace(mobile,'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g')) LIMIT 20",[p.name,p.mobile])).rows;
  if (matches.length && input.confirm_distinct_patient !== true) throw new AppError('Possible existing patient found. Select the patient or confirm this is a different person.',409,{}, {matches});
  const seq=(await tx.query("SELECT nextval('patient_uid_seq') AS n")).rows[0].n, now=new Date().toISOString();
  return (await tx.query('INSERT INTO patients(id,uid_sequence,patient_uid,name,mobile,age,gender,address,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *',[randomUUID(),seq,numbered('YPC-UID-',seq),p.name,p.mobile,p.age,p.gender,p.address,now])).rows[0];
}
export const createPatient = (db,input) => db.transaction(tx=>insertPatient(tx,input));
const visitSelect = `SELECT v.*, p.name AS patient_name,p.patient_uid,p.mobile,p.age,p.gender,p.address,d.name AS doctor_name,i.id AS invoice_id,i.invoice_number
 FROM opd_visits v JOIN patients p ON p.id=v.patient_id JOIN doctors d ON d.id=v.doctor_id LEFT JOIN invoices i ON i.opd_visit_id=v.id`;
export async function getVisit(db,id) {
  if (!isUuid(id)) throw new AppError('OPD visit not found',404);
  const visit=(await db.query(visitSelect+' WHERE v.id=$1',[id])).rows[0];
  if (!visit) throw new AppError('OPD visit not found',404);
  return {...visit,consultation_total_paise:consultationTotal(visit.consultation_fee_paise),invoice:visit.invoice_id?await getInvoice(db,visit.invoice_id):null};
}
export async function listVisits(db,q='') {
  return (await db.query(visitSelect+` WHERE p.name ILIKE $1 OR p.patient_uid ILIKE $1 OR p.mobile ILIKE $1 OR v.opd_number ILIKE $1 OR d.name ILIKE $1 OR v.illness_text ILIKE $1 ORDER BY v.visited_at DESC,v.opd_sequence DESC LIMIT 100`,[searchTerm(q)])).rows;
}
export async function createVisit(db,input,user_id) {
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
    await tx.query('INSERT INTO opd_visits(id,opd_sequence,opd_number,patient_id,doctor_id,illness_code,illness_text,consultation_fee_paise,payment_status,payment_mode,note,visited_at,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id,seq,numbered('OPD-',seq),patient.id,v.doctor_id,v.illness_code,v.illness_text,v.consultation_fee_paise,v.payment_status,v.payment_mode,v.note,v.visited_at,user_id,new Date().toISOString()]);
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
    const invoice=await insertInvoice(tx,{patient_name:visit.patient_name,age:visit.age,gender:visit.gender,items,payment_mode:visit.payment_mode || 'UNPAID',paid_paise:visit.payment_status==='paid'?visit.consultation_total_paise:0},{patient_id:visit.patient_id,opd_visit_id:id,registration:visit.patient_uid,user_id});
    await audit(tx,'invoice_linked',{invoice_id:invoice.id,opd_visit_id:id,user_id,details:'OPD consultation linked to invoice'});
    return {invoice,created:true};
  });
}
