export async function nextPatientNumber(tx) {
  const row=(await tx.query('UPDATE patient_uhid_counter SET last_value=last_value+1 WHERE singleton RETURNING last_value AS n')).rows[0];
  if(!row)throw Error('UHID counter is not initialized. Apply the UHID counter migration.');
  return row.n;
}
