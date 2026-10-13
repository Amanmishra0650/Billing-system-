import { readdir,readFile,access } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
if(Number(process.versions.node.split('.')[0])<24)throw Error('Production requires Node.js 24 or newer');
const files=[];
for(const directory of ['','api','public','scripts']){
  for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})){
    if(entry.isFile() && /\.(?:mjs|js)$/.test(entry.name))files.push(resolve(root,directory,entry.name));
  }
}
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(`Syntax validation failed: ${file.slice(root.length)}`);
  const source=await readFile(file,'utf8');
  for(const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g))await access(resolve(dirname(file),match[1]));
}
const html=await readFile(resolve(root,'public/index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="\/(?!\/)([^"?#]+)"/g))await access(resolve(root,'public',match[1]));
const config=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
if(config.outputDirectory!=='public')throw Error('Expected production static output directory public');
await access(resolve(root,'migrations/2026-10-13-medicines.sql'));
console.log(`Production verification passed: ${files.length} JavaScript modules, local imports, HTML assets, migration, and Vercel static output.`);
console.log('Deployable frontend: public/ (served directly; no bundling step required).');
