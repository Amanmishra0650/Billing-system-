# Fresh UHID and OPD numbering

New patients receive permanent numeric UHIDs starting at 2011162. Each new visit receives an OPD number starting at OPD-0001, padded to at least four digits. Returning patients retain their existing UHID across visits. Database sequences and unique constraints prevent concurrent duplicate allocation; sequences are never reset during startup.

Use a separate fresh database for the new installation. Retain the existing database and its records unchanged. The first patient and visit in the fresh database receive the requested starting numbers. Existing databases retain their issued identifiers and sequence progress.

Update the OPD registration slip to label the patient identifier UHID. Preserve the same identifier in linked invoices and patient search.

Approaches: resetting the current database risks reused identifiers and conflicts with preserving patient history. A separate fresh database provides the requested starting numbers while retaining the old installation. The latter is recommended; the user has requested a fresh start.

Verify first identifiers, a second patient, multiple visits for one patient, concurrent allocations, and persistence across database restarts using isolated test data. Do not delete records or silently reset any existing sequence.
