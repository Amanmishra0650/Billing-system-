import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.mjs';

const port = Number(process.env.PORT || 3000);
const limit = 64 * 1024;
const cookieName = 'yogi_session';
const attempts = new Map();
const hashToken = token => createHash('sha256').update(token).digest('hex');
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(value)); };
const fail = (res, status, error) => json(res,status,{error});
async function body(req) {
 let chunks=[], size=0;
 for await (const chunk of req) { size += chunk.length; if(size>limit) { const e=new Error('Request too large'); e.status=413; throw e; } chunks.push(chunk); }
 try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { const e=new Error('Invalid JSON'); e.status=400; throw e; }
}
function auth(req) {
 const match = req.headers.cookie?.match(/(?:^|;\s*)yogi_session=([a-f0-9]{64})(?:;|$)/);
 if (!match) return false;
 return !!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(match[1]),Date.now());
}
function text(v,max=150) { return String(v ?? '').trim().slice(0,max); }
function invoice(input) {
 const patient_name=text(input.patient_name,100), registration=text(input.registration,60);
 if (!patient_name) throw new Error('Patient name is required');
 if (!Array.isArray(input.items) || !input.items.length || input.items.length>30) throw new Error('Add 1 to 30 charges');
 const items=input.items.map(item=>({description:text(item.description,140),amount_paise:Number(item.amount_paise)}));
 if(items.some(x=>!x.description || !Number.isSafeInteger(x.amount_paise) || x.amount_paise<0 || x.amount_paise>100000000)) throw new Error('Enter valid charge descriptions and amounts');
 const rate=Number(input.tax_rate_bps);
 if(!Number.isSafeInteger(rate)||rate<0||rate>5000) throw new Error('Enter a valid tax rate');
 const subtotal=items.reduce((sum,x)=>sum+x.amount_paise,0);
 const cgst=Math.round(subtotal*rate/10000), sgst=Math.round(subtotal*rate/10000);
 const total=subtotal+cgst+sgst;
 const paid=Number(input.paid_paise);
 if(!Number.isSafeInteger(paid)||paid<0||paid>total) throw new Error('Paid amount must be between zero and the total');
 const age=text(input.age,10);
 if(age && (!/^\d{1,3}$/.test(age) || Number(age)>120)) throw new Error('Enter a valid age');
 const gender=text(input.gender,30), payment_mode=text(input.payment_mode,40);
 if(!payment_mode) throw new Error('Payment mode is required');
 return {patient_name,age,gender,registration,payment_mode,paid_paise:paid,tax_rate_bps:rate,subtotal_paise:subtotal,cgst_paise:cgst,sgst_paise:sgst,total_paise:total,items};
}
const parse = row => {
 if (!row) return null;
 const payments=db.prepare('SELECT id,amount_paise,mode,received_at,note FROM payments WHERE invoice_id=? ORDER BY id').all(row.id);
 const paid=row.paid_paise+payments.reduce((sum,p)=>sum+p.amount_paise,0);
 return {...row,items:JSON.parse(row.items_json),payments,received_paise:paid,balance_paise:row.total_paise-paid};
};
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)) {
   const origin=req.headers.origin;
   const host=req.headers.host;
   if(origin && (!host || new URL(origin).host!==host)) return fail(res,403,'Invalid request origin');
   if(req.headers['content-type'] && !req.headers['content-type'].startsWith('application/json')) return fail(res,415,'JSON required');
  }
  if(req.method==='POST' && url.pathname==='/api/login') {
   const ip=req.socket.remoteAddress||'unknown';
   const hit=attempts.get(ip);
   if(hit && hit.until>Date.now()) return fail(res,429,'Too many attempts. Try again later');
   const data=await body(req), user=db.prepare('SELECT * FROM users WHERE username=?').get(text(data.username,80));
   const provided=scryptSync(String(data.password||''),user?.salt||'00000000000000000000000000000000',64);
   if(!user || !timingSafeEqual(provided,Buffer.from(user.hash,'hex'))) {
    const count=(hit?.count||0)+1; attempts.set(ip,{count,until:count>=5?Date.now()+15*60*1000:0});
    return fail(res,401,'Invalid username or password');
   }
   attempts.delete(ip);
   const token=randomBytes(32).toString('hex');
   db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token),user.id,Date.now()+8*60*60*1000);
   res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
   return json(res,200,{username:user.username});
  }
  if(url.pathname.startsWith('/api/')) {
   if(!auth(req)) return fail(res,401,'Please sign in');
   if(req.method==='GET' && url.pathname==='/api/me') return json(res,200,{authenticated:true});
   if(req.method==='POST' && url.pathname==='/api/logout') {
    const token=req.headers.cookie?.match(/yogi_session=([a-f0-9]{64})/)?.[1];
    if(token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return json(res,200,{ok:true});
   }
   if(req.method==='POST' && url.pathname==='/api/invoices') {
    const value=invoice(await body(req));
    const row=db.prepare(`INSERT INTO invoices (created_at,patient_name,age,gender,registration,payment_mode,paid_paise,tax_rate_bps,subtotal_paise,cgst_paise,sgst_paise,total_paise,items_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(new Date().toISOString(),value.patient_name,value.age,value.gender,value.registration,value.payment_mode,value.paid_paise,value.tax_rate_bps,value.subtotal_paise,value.cgst_paise,value.sgst_paise,value.total_paise,JSON.stringify(value.items));
    const id=Number(row.lastInsertRowid), num=`YPC-${String(id).padStart(6,'0')}`;
    db.prepare('UPDATE invoices SET invoice_number=? WHERE id=?').run(num,id);
    db.prepare('INSERT INTO audit_log (invoice_id,action,details,created_at) VALUES (?,?,?,?)').run(id,'created','Invoice issued',new Date().toISOString());
    return json(res,201,parse(db.prepare('SELECT * FROM invoices WHERE id=?').get(id)));
   }
   if(req.method==='GET' && url.pathname==='/api/invoices') {
    const q=`%${text(url.searchParams.get('q'),100)}%`;
    const rows=db.prepare('SELECT * FROM invoices WHERE patient_name LIKE ? OR invoice_number LIKE ? OR registration LIKE ? ORDER BY id DESC LIMIT 100').all(q,q,q);
    return json(res,200,rows.map(row=>{const v=parse(row);return {id:v.id,invoice_number:v.invoice_number,created_at:v.created_at,patient_name:v.patient_name,registration:v.registration,total_paise:v.total_paise,received_paise:v.received_paise,voided_at:v.voided_at};}));
   }
   const match=url.pathname.match(/^\/api\/invoices\/(\d+)$/);
   const payment=url.pathname.match(/^\/api\/invoices\/(\d+)\/payments$/);
   if(req.method==='POST' && payment) {
    const id=Number(payment[1]), data=await body(req), row=db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if(!row) return fail(res,404,'Invoice not found');
    if(row.voided_at) return fail(res,409,'Voided invoices cannot receive payment');
    const amount=Number(data.amount_paise), mode=text(data.mode,40), note=text(data.note,200);
    const current=parse(row);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>current.balance_paise||!mode) return fail(res,400,'Enter a valid amount and payment mode within the balance');
    db.exec('BEGIN IMMEDIATE');
    try {
     const check=parse(db.prepare('SELECT * FROM invoices WHERE id=?').get(id));
     if(amount>check.balance_paise) throw Error('Payment exceeds balance');
     db.prepare('INSERT INTO payments (invoice_id,amount_paise,mode,received_at,note) VALUES (?,?,?,?,?)').run(id,amount,mode,new Date().toISOString(),note);
     db.prepare('INSERT INTO audit_log (invoice_id,action,details,created_at) VALUES (?,?,?,?)').run(id,'payment',`${amount} paise via ${mode}`,new Date().toISOString());
     db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
    return json(res,201,parse(db.prepare('SELECT * FROM invoices WHERE id=?').get(id)));
   }
   const voidMatch=url.pathname.match(/^\/api\/invoices\/(\d+)\/void$/);
   if(req.method==='POST' && voidMatch) {
    const id=Number(voidMatch[1]), data=await body(req), reason=text(data.reason,200);
    if(reason.length<5) return fail(res,400,'Enter a reason of at least five characters');
    const row=db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if(!row) return fail(res,404,'Invoice not found');
    if(row.voided_at) return fail(res,409,'Already voided');
    if(parse(row).received_paise>0) return fail(res,409,'Record a refund outside this app before voiding a paid invoice');
    const now=new Date().toISOString();
    db.prepare('UPDATE invoices SET voided_at=?,void_reason=? WHERE id=?').run(now,reason,id);
    db.prepare('INSERT INTO audit_log (invoice_id,action,details,created_at) VALUES (?,?,?,?)').run(id,'voided',reason,now);
    return json(res,200,parse(db.prepare('SELECT * FROM invoices WHERE id=?').get(id)));
   }
   if(req.method==='GET' && match) {
    const row=db.prepare('SELECT * FROM invoices WHERE id=?').get(Number(match[1]));
    return row?json(res,200,parse(row)):fail(res,404,'Invoice not found');
   }
   return fail(res,404,'Not found');
  }
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(!['/index.html','/app.js','/styles.css'].includes(path) || req.method!=='GET') return fail(res,404,'Not found');
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
  const content=await readFile(new URL(`./public${path}`,import.meta.url));
  res.writeHead(200,{'Content-Type':types[path.slice(path.lastIndexOf('.'))],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}); res.end(content);
 } catch(e) { console.error(e); fail(res,e.status||400,e.status===413?'Request too large':e.message||'Request failed'); }
});
if(!db.prepare('SELECT id FROM users LIMIT 1').get()) console.warn('No staff account. Run npm run setup -- admin "a-unique-password-at-least-12-characters"');
server.listen(port,()=>console.log(`Billing app listening on http://localhost:${port}`));
