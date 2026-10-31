import {createDatabase} from './database.mjs';
import {migrateUhidCounter} from './uhid-counter-migration.mjs';
let db;
try{
  db=await createDatabase({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,initialize:false});
  console.log(JSON.stringify(await migrateUhidCounter(db)));
}catch{console.error('UHID counter migration failed; transaction rolled back. Check schema and configuration.');process.exitCode=1;}
finally{if(db)await db.close();}
