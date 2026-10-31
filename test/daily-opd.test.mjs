import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../database.mjs';
import {seedAdmin} from '../auth.mjs';
import {createPatient,createVisit} from '../opd-service.mjs';
import {renderOpdSlip} from '../public/opd-print.js';

test('daily OPD numbering follows Kolkata dates and preserves permanent IDs',async()=>{
  const db=await createDatabase({connectionString:'',dataDir:'memory://'});
  try{
    await seedAdmin(db,'test','test-password-only');
    const user=(await db.query('SELECT id FROM users LIMIT 1')).rows[0].id;
    const doctor=(await db.query('SELECT id FROM doctors LIMIT 1')).rows[0].id;
    const patient=await createPatient(db,{name:'Daily numbering patient'});
    await db.query("SELECT setval('opd_number_seq',100,false)");
    const input={clinic_address_id:'munshipuliya',patient_id:patient.id,doctor_id:doctor,illness_code:'piles',consultation_fee_paise:40000,payment_status:'unpaid'};
    const first=await createVisit(db,{...input,visited_at:'2026-11-01T18:29:59Z'},user);
    assert.equal(first.daily_opd_number,1);
    assert.equal(first.opd_date,'2026-11-01');
    assert.equal(first.opd_number,'OPD-0100');
    const nextDay=await createVisit(db,{...input,visited_at:'2026-11-01T18:30:00Z'},user);
    assert.equal(nextDay.daily_opd_number,1);
    assert.equal(nextDay.opd_date,'2026-11-02');
    const simultaneous=await Promise.all([1,2,3].map(()=>createVisit(db,{...input,visited_at:'2026-11-01T18:31:00Z'},user)));
    assert.deepEqual(simultaneous.map(v=>v.daily_opd_number).sort(),[2,3,4]);
    assert.ok(simultaneous.every(v=>v.patient_uid===first.patient_uid));
    await assert.rejects(createVisit(db,{...input,visited_at:'2026-11-01T18:32:00Z'},999999),{code:'23503'});
    assert.equal((await createVisit(db,{...input,visited_at:'2026-11-01T18:33:00Z'},user)).daily_opd_number,5,'failed registrations do not consume daily numbers');
    await assert.rejects(db.query('UPDATE opd_visits SET daily_opd_number=1 WHERE id=$1',[simultaneous[0].id]),{code:'23505'});
    const html=renderOpdSlip(first,{esc:v=>String(v??''),fmt:String,words:String});
    assert.match(html,/OPD Number:.*OPD-001/s);
    assert.doesNotMatch(html,/Permanent OPD ID|OPD-0100/);
  }finally{await db.close();}
});
