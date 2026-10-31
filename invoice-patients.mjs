import {insertPatient} from './patients.mjs';
import {insertInvoice} from './billing.mjs';
import {AppError,invalid,isUuid,validatePatient} from './opd.mjs';

export async function createStandaloneInvoice(db,input,user_id=null) {
  return db.transaction(async tx=>{
    let patient;
    if(input.patient_id!==undefined&&input.patient_id!==null) {
      if(!isUuid(input.patient_id))invalid('patient_id','Select a valid existing patient');
      if(input.patient)invalid('patient_id','Choose either an existing or a new patient');
      patient=(await tx.query('SELECT * FROM patients WHERE id=$1 FOR UPDATE',[input.patient_id])).rows[0];
      if(!patient)throw new AppError('Patient not found',404);
      if(input.patient_name!==undefined&&input.patient_name!==patient.name)invalid('patient_name','Patient name changed. Search and select the correct patient again.');
      if(input.patient_details!==undefined) {
        if(!input.patient_details||typeof input.patient_details!=='object'||Array.isArray(input.patient_details))invalid('patient_details','Enter valid patient details');
        const details=input.patient_details;
        if(Object.keys(details).some(key=>!['name','mobile','age','gender','address'].includes(key)))invalid('patient_details','Only demographic details may be updated');
        if(details.name!==undefined&&details.name!==patient.name)invalid('patient_name','Patient name changed. Search and select the correct patient again.');
        const next=validatePatient({...patient,...details});
        const changed=['mobile','age','gender','address'].some(key=>next[key]!==patient[key]);
        if(changed) {
          if(input.confirm_patient_update!==true)throw new AppError('Confirm changes before updating the patient master record.',409,{patient_details:'Confirmation required'});
          if(input.patient_original&&['mobile','age','gender','address'].some(key=>input.patient_original[key]!==patient[key]))throw new AppError('Patient details changed. Search and select the patient again.',409);
          if(input.patient_version&&input.patient_version!==patient.updated_at)throw new AppError('Patient details changed. Search and select the patient again.',409);
          patient=(await tx.query('UPDATE patients SET mobile=$2,age=$3,gender=$4,address=$5,updated_at=$6 WHERE id=$1 RETURNING *',[patient.id,next.mobile,next.age,next.gender,next.address,new Date().toISOString()])).rows[0];
        }
      }
    } else {
      patient=await insertPatient(tx,input.patient||{name:input.patient_name,mobile:input.mobile,age:input.age,gender:input.gender,address:input.address});
    }
    return insertInvoice(tx,{...input,patient_name:patient.name,age:patient.age,gender:patient.gender,patient_mobile:patient.mobile,patient_address:patient.address},{patient_id:patient.id,registration:patient.patient_uid,user_id});
  });
}
