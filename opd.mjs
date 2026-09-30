export const ILLNESSES = [
  ['piles','Piles'], ['anal-fissure','Anal Fissure'], ['fistula','Fistula'],
  ['constipation','Constipation'], ['pilonidal-sinus','Pilonidal Sinus'],
  ['rectal-bleeding','Rectal Bleeding'], ['abdominal-pain','Abdominal Pain'],
  ['acidity','Acidity'], ['other','Other'],
].map(([code,name]) => ({code,name}));
export const DOCTORS = ['Dr. Saurabh Mishra','Dr. Aman Mishra','Dr. Suraj Mishra'];
export const PAYMENT_MODES = ['CASH','UPI','CARD','BANK TRANSFER','OTHER'];
export class AppError extends Error {
  constructor(message, status = 400, fields = {}, extra = {}) {
    super(message); this.status = status; this.fields = fields; this.extra = extra;
  }
}
export function invalid(field, message) { throw new AppError(message,400,{[field]:message}); }
export function string(value, max = 150) { return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function consultationTotal(fee) { return fee + 2 * Math.round(fee * 900 / 10000); }
export function validatePatient(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('name','Enter patient details');
  const name = string(input.name,100), mobile = string(input.mobile,20), age = input.age == null ? '' : String(input.age).trim();
  const gender = string(input.gender,30), address = string(input.address,300);
  if (!name) invalid('name','Patient name is required');
  if (mobile && !/^\+?[\d ()-]{7,20}$/.test(mobile)) invalid('mobile','Enter a valid mobile number');
  if (age && (!/^\d{1,3}$/.test(age) || Number(age)>120)) invalid('age','Enter a valid age from 0 to 120');
  if (gender && !['Male','Female','Other'].includes(gender)) invalid('gender','Select a valid gender');
  return {name,mobile,age,gender,address};
}
export function validateVisit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('doctor_id','Enter visit details');
  if (!isUuid(input.doctor_id)) invalid('doctor_id','Select a doctor');
  const illness = ILLNESSES.find(x => x.code === input.illness_code);
  if (!illness) invalid('illness_code','Select an illness');
  const illness_text = illness.code === 'other' ? string(input.custom_illness,140) : illness.name;
  if (!illness_text) invalid('custom_illness','Enter the custom illness');
  const fee = input.consultation_fee_paise;
  if (!Number.isSafeInteger(fee) || fee<0 || fee>100000000) invalid('consultation_fee_paise','Enter a valid consultation fee');
  if (!['paid','unpaid'].includes(input.payment_status)) invalid('payment_status','Select Paid or Unpaid payment status');
  const payment_mode = input.payment_status === 'paid' ? string(input.payment_mode,40) : null;
  if (input.payment_status === 'paid' && !PAYMENT_MODES.includes(payment_mode)) invalid('payment_mode','Select a payment mode for a paid visit');
  const date = input.visited_at === undefined ? new Date() : new Date(typeof input.visited_at === 'string' ? input.visited_at : NaN);
  if (!Number.isFinite(date.getTime())) invalid('visited_at','Enter a valid visit date and time');
  return {doctor_id:input.doctor_id,illness_code:illness.code,illness_text,consultation_fee_paise:fee,payment_status:input.payment_status,payment_mode,note:string(input.note,300),visited_at:date.toISOString()};
}
