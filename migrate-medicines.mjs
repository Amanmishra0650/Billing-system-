import { createDatabase } from './database.mjs';
import { migrateMedicines } from './medicine-migration.mjs';
let db;
try {
  // Reuse configured credentials. Prefer an existing direct URL for migrations.
  db=await createDatabase({connectionString:process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,initialize:false});
  const result=await migrateMedicines(db);
  console.log('Medicine migration applied. Existing record fingerprints are unchanged.');
  console.log(JSON.stringify(result));
}catch(error){
  console.error('Medicine migration failed; transaction rolled back. Check database configuration and schema.');
  process.exitCode=1;
}finally{if(db)await db.close();}
