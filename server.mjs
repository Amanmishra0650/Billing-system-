import http from 'node:http';
import { getDatabase } from './database.mjs';
import { createHandler } from './handler.mjs';
const db=await getDatabase();
const port=Number(process.env.PORT||3000);
const server=http.createServer(createHandler(db));
if (!(await db.query('SELECT id FROM users LIMIT 1')).rows.length) console.warn('No staff account. Run npm run setup before signing in.');
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Billing app listening on http://localhost:${server.address().port}`));
let closing=false;
async function shutdown() {
  if(closing)return;closing=true;
  server.close(async()=>{await db.close();process.exit(0);});
  server.closeIdleConnections();
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
