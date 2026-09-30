import { createDatabase } from './database.mjs';
import { migrateSqlite } from './migration.mjs';
const db=await createDatabase();
try {
  const report=await migrateSqlite(db,process.argv[2]||'data/billing.sqlite',process.argv[3]||'backups');
  console.log('Migration verified. Source SQLite retained.');
  console.log(JSON.stringify(report,null,2));
} catch(error) { console.error(error.message.startsWith('Migration requires')?error.message:'Migration failed. No destination records were committed. Check the source and database configuration.');process.exitCode=1; }
finally { await db.close(); }
