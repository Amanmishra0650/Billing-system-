import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePatient, validateVisit, consultationTotal, ILLNESSES } from '../opd.mjs';

const visit = { doctor_id: '11111111-1111-4111-8111-111111111111', illness_code: 'piles', consultation_fee_paise: 50000, payment_status: 'paid', payment_mode: 'CASH', visited_at: '2026-09-30T10:00:00.000Z' };
test('new consultation is tax-free and accepts percentage discounts', () => {
  assert.equal(consultationTotal(50000), 50000);
  assert.equal(validateVisit(visit).payment_mode, 'CASH');
});
test('Other illness requires custom text and allowed illness codes are enforced', () => {
  assert.throws(() => validateVisit({...visit, illness_code:'other'}), /illness/i);
  assert.equal(validateVisit({...visit, illness_code:'other', custom_illness:'Follow-up concern'}).illness_text, 'Follow-up concern');
  assert.throws(() => validateVisit({...visit, illness_code:'invented'}), /illness/i);
  assert.equal(ILLNESSES.length, 9);
});
test('paid requires a mode; unpaid clears payment mode', () => {
  assert.throws(() => validateVisit({...visit, payment_mode:''}), /payment mode/i);
  assert.equal(validateVisit({...visit, payment_status:'unpaid'}).payment_mode, null);
  assert.throws(() => validateVisit({...visit, payment_status:'partial'}), /status/i);
});
test('reject malformed doctor, dates, noninteger and negative fees', () => {
  for (const consultation_fee_paise of [-1, 1.2, null, '500', Number.MAX_SAFE_INTEGER]) assert.throws(() => validateVisit({...visit, consultation_fee_paise}));
  assert.throws(() => validateVisit({...visit, doctor_id:'Dr. Someone'}), /doctor/i);
  assert.throws(() => validateVisit({...visit, visited_at:'invalid'}), /date/i);
});
test('patient validation requires name and rejects invalid demographics', () => {
  assert.equal(validatePatient({name:'  Test Patient  ', mobile:'9876543210', age:'40', gender:'Female', address:'Local'}).name, 'Test Patient');
  assert.throws(() => validatePatient({name:''}), /name/i);
  assert.throws(() => validatePatient({name:'Test', age:'121'}), /age/i);
  assert.throws(() => validatePatient({name:'Test', mobile:'abc'}), /mobile/i);
});

test('discount validation, rounding and legacy totals', () => {
  assert.equal(consultationTotal(50000,1000),45000);
  assert.equal(consultationTotal(101,1250),88);
  assert.equal(consultationTotal(50000,10000),0);
  assert.equal(consultationTotal(50000,0,900),59000);
  assert.equal(validateVisit({...visit,discount_percent:12.5}).discount_bps,1250);
  for(const discount_percent of [-1,101,1.234,'10',null]) assert.throws(()=>validateVisit({...visit,discount_percent}),/discount/i);
});
