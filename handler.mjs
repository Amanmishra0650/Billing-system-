import { readFile } from 'node:fs/promises';
import { AppError, ILLNESSES } from './opd.mjs';
import { authenticate, login, cookieToken, hashToken, sessionCookie, checkProductionConfig } from './auth.mjs';
import { getInvoice, insertInvoice, listInvoices, changeInvoice, numbered } from './billing.mjs';
import { findPatients, createPatient, createVisit, getVisit, listVisits, invoiceFromVisit } from './opd-service.mjs';

const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function body(req) {
  let raw;
  if (req.body !== undefined) raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else {
    const chunks=[]; let size=0;
    for await (const chunk of req) { size+=chunk.length; if(size>65536) throw new AppError('Request too large',413); chunks.push(chunk); }
    raw=Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw)>65536) throw new AppError('Request too large',413);
  try { const data=JSON.parse(raw || '{}'); if(!data||typeof data!=='object'||Array.isArray(data)) throw Error(); return data; }
  catch { throw new AppError('Invalid JSON object'); }
}
export function createHandler(db) {
  checkProductionConfig();
  return async (req,res) => {
    try {
      const url=new URL(req.url,'http://localhost'), path=url.pathname;
      if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        if (req.headers.origin) {
          let origin; try { origin=new URL(req.headers.origin); } catch { throw new AppError('Invalid request origin',403); }
          if(origin.host!==req.headers.host) throw new AppError('Invalid request origin',403);
        }
        if (req.headers['content-type'] && !req.headers['content-type'].startsWith('application/json')) throw new AppError('JSON required',415);
      }
      if (path==='/api/login' && req.method==='POST') {
        const user=await login(db,await body(req)); res.setHeader('Set-Cookie',sessionCookie(user.token)); return json(res,200,{username:user.username});
      }
      if (path.startsWith('/api/')) {
        const user_id=await authenticate(db,req);
        if(path==='/api/me'&&req.method==='GET') return json(res,200,{authenticated:true});
        if(path==='/api/logout'&&req.method==='POST') {
          await db.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(cookieToken(req))]); res.setHeader('Set-Cookie',sessionCookie('',0)); return json(res,200,{ok:true});
        }
        if(path==='/api/doctors'&&req.method==='GET') return json(res,200,(await db.query('SELECT id,name FROM doctors WHERE active=true ORDER BY created_at,name')).rows);
        if(path==='/api/illnesses'&&req.method==='GET') return json(res,200,ILLNESSES);
        if(path==='/api/patients'&&req.method==='GET') return json(res,200,await findPatients(db,url.searchParams.get('q')));
        if(path==='/api/patients'&&req.method==='POST') return json(res,201,await createPatient(db,await body(req)));
        if(path==='/api/opd-visits'&&req.method==='GET') return json(res,200,await listVisits(db,url.searchParams.get('q')));
        if(path==='/api/opd-visits'&&req.method==='POST') return json(res,201,await createVisit(db,await body(req),user_id));
        const visit=path.match(/^\/api\/opd-visits\/([^/]+)(\/invoice)?$/);
        if(visit && req.method==='GET' && !visit[2]) return json(res,200,await getVisit(db,visit[1]));
        if(visit && req.method==='POST' && visit[2]) { const result=await invoiceFromVisit(db,visit[1],await body(req),user_id); return json(res,result.created?201:200,result.invoice); }
        if(path==='/api/registration-preview'&&req.method==='GET') {
          const seq=(await db.query('SELECT last_value,is_called FROM patient_uid_seq')).rows[0]; return json(res,200,{registration:numbered('YPC-UID-',seq.is_called?seq.last_value+1:seq.last_value)});
        }
        if(path==='/api/invoices'&&req.method==='GET') return json(res,200,await listInvoices(db,url.searchParams.get('q')));
        if(path==='/api/invoices'&&req.method==='POST') { const input=await body(req); return json(res,201,await db.transaction(tx=>insertInvoice(tx,input,{user_id}))); }
        const invoice=path.match(/^\/api\/invoices\/(\d+)(?:\/(payments|payment-status|void))?$/);
        if(invoice && Number.isSafeInteger(Number(invoice[1]))) {
          if(req.method==='GET'&&!invoice[2]) return json(res,200,await db.transaction(tx=>getInvoice(tx,Number(invoice[1]),{lock:true})));
          if(req.method==='POST'&&invoice[2]) return json(res,invoice[2]==='payments'?201:200,await changeInvoice(db,Number(invoice[1]),invoice[2],await body(req),user_id));
        }
        throw new AppError('Not found',404);
      }
      const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/opd-ui.js':'opd-ui.js','/opd-print.js':'opd-print.js','/styles.css':'styles.css','/logo.png':'logo.png'};
      if (req.method!=='GET'||!assets[path]) throw new AppError('Not found',404);
      const file=assets[path], types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',png:'image/png'};
      const content=await readFile(new URL('./public/'+file,import.meta.url));
      res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}); res.end(content);
    } catch(error) {
      if(error instanceof AppError) return json(res,error.status,{error:error.message,fields:error.fields,...error.extra});
      // Never log SQL, request bodies, credentials, or patient details.
      console.error('Request failed', /^[A-Z0-9]{5}$/.test(error.code||'')?error.code:'internal');
      json(res,500,{error:'The request could not be completed. Please try again.'});
    }
  };
}
