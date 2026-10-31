import {randomUUID} from 'node:crypto';
import {AppError,string,validatePatient} from './opd.mjs';
import {numbered} from './billing.mjs';
import {nextPatientNumber} from './patient-numbering.mjs';

export async function findPatients(db,q='') {
  const query=string(q,100);
  if(query.length<2)return [];
  const term='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
  const digits=query.replace(/[^0-9]/g,'');
  return (await db.query(`SELECT p.id,p.patient_uid,p.name,p.mobile,p.age,p.gender,p.address,
    (SELECT max(v.visited_at::timestamptz) FROM opd_visits v WHERE v.patient_id=p.id) AS last_visit_at
    FROM patients p WHERE p.name ILIKE $1 OR p.patient_uid ILIKE $1 OR p.mobile ILIKE $1
      OR ($2<>'' AND regexp_replace(p.mobile,'[^0-9]','','g') LIKE '%'||$2||'%')
    ORDER BY p.uid_sequence DESC LIMIT 20`,[term,digits.length>=2?digits:''])).rows.map(p=>({...p,last_visit_at:p.last_visit_at?new Date(p.last_visit_at).toISOString():null}));
}

export async function insertPatient(tx,input) {
  const p=validatePatient(input);
  await tx.exec('LOCK TABLE patients IN SHARE ROW EXCLUSIVE MODE');
  const matches=(await tx.query("SELECT id,patient_uid,name,mobile,age,gender,address FROM patients WHERE lower(name)=lower($1) OR ($2<>'' AND regexp_replace(mobile,'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g')) LIMIT 20",[p.name,p.mobile])).rows;
  if(matches.length&&input.confirm_distinct_patient!==true)throw new AppError('Possible existing patient found. Select the patient or confirm this is a different person.',409,{}, {matches});
  const seq=await nextPatientNumber(tx),now=new Date().toISOString();
  return (await tx.query('INSERT INTO patients(id,uid_sequence,patient_uid,name,mobile,age,gender,address,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *',[randomUUID(),seq,numbered('YPC-UID-',seq),p.name,p.mobile,p.age,p.gender,p.address,now])).rows[0];
}
export const createPatient=(db,input)=>db.transaction(tx=>insertPatient(tx,input));
