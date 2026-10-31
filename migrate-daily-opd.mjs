import {createDatabase} from './database.mjs';
import {migrateDailyOpd} from './daily-opd-migration.mjs';
let db;
try {
  db=await createDatabase({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,initialize:false});
  console.log(JSON.stringify(await migrateDailyOpd(db)));
} catch {
  console.error('Daily OPD migration failed; transaction rolled back. Check schema and legacy visit timestamps.');
  process.exitCode=1;
} finally { if(db)await db.close(); }
