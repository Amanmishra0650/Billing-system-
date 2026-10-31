export async function nextPatientNumber(tx) {
  const result = await tx.query(
    "SELECT nextval('public.patient_uid_seq') AS n"
  );

  return result.rows[0].n;
}
