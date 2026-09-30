import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
const [archive,destination]=process.argv.slice(2);
if(!archive||!destination) throw Error('Usage: npm run restore:local -- backup.tar.gz data/new-postgres-directory');
const target=resolve(destination);
try {await stat(target);throw Error('Restore destination already exists. Choose a new directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(resolve(target,'..'),{recursive:true});
const db=await PGlite.create({dataDir:target,loadDataDir:new Blob([await readFile(resolve(archive))])});
try {await db.query('SELECT count(*) FROM invoices');console.log('Local backup restored to the new directory. Set PGLITE_DATA_DIR to this path and verify invoices before cutover.');}
finally {await db.close();}
