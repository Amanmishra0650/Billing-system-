import { createDatabase } from './database.mjs';
import { seedAdmin } from './auth.mjs';
const db=await createDatabase();
try {
  const username=process.argv[2]||process.env.ADMIN_USERNAME;
  const password=process.argv[3]||process.env.ADMIN_PASSWORD;
  if(username||password) {
    const created=await seedAdmin(db,username,password);
    console.log(created?'Staff account created. Start with npm start.':'Existing staff account retained. Schema and doctor seed are ready.');
  } else console.log('Schema and doctor seed are ready. Set ADMIN_USERNAME and ADMIN_PASSWORD, then rerun setup to create the initial account.');
} catch(error) { console.error(error.status?error.message:'Setup failed. Check database configuration.');process.exitCode=1; }
finally { await db.close(); }
