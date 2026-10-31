import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOpdSlip } from '../public/opd-print.js';

test('OPD slip header shows UHID above the OPD number',()=>{
  const html=renderOpdSlip({patient_uid:'2011195',opd_number:'OPD-0034',patient_name:'Aman',visited_at:'2026-11-01T00:00:00Z',consultation_fee_paise:40000,consultation_total_paise:40000,tax_rate_bps:0},{esc:v=>String(v??''),fmt:String,words:String});
  assert.match(html,/class="opd-identifiers"/);
  const identifiers=html.slice(html.indexOf('class="opd-identifiers"'),html.indexOf('<div class="patient-box">'));
  assert.match(identifiers,/UHID Number:.*2011195/s);
  assert.match(identifiers,/OPD Number:.*OPD-0034/s);
  assert.ok(identifiers.indexOf('UHID Number:')<identifiers.indexOf('OPD Number:'));
});
