import {createDatabase} from './database.mjs';
import {migrateInvoicePatients} from './invoice-patient-migration.mjs';
let db;
try {
  db=await createDatabase({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,initialize:false});
  console.log(JSON.stringify(await migrateInvoicePatients(db)));
} catch {
  console.error('Invoice patient migration failed; transaction rolled back. Check database configuration.');process.exitCode=1;
} finally {if(db)await db.close();}
