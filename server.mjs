import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.mjs';

const port = Number(process.env.PORT || 3000);
const limit = 64 * 1024;
const cookieName = 'yogi_session';
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
const parse = row => row && ({...row,items:JSON.parse(row.items_json)});
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(req.method==='POST' && url.pathname==='/api/login') {
   const data=await body(req), user=db.prepare('SELECT * FROM users WHERE username=?').get(text(data.username,80));
   const provided=scryptSync(String(data.password||''),user?.salt||'00000000000000000000000000000000',64);
   if(!user || !timingSafeEqual(provided,Buffer.from(user.hash,'hex'))) return fail(res,401,'Invalid username or password');
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
    return json(res,201,parse(db.prepare('SELECT * FROM invoices WHERE id=?').get(id)));
   }
   if(req.method==='GET' && url.pathname==='/api/invoices') {
    const q=`%${text(url.searchParams.get('q'),100)}%`;
    return json(res,200,db.prepare('SELECT id,invoice_number,created_at,patient_name,registration,total_paise,paid_paise FROM invoices WHERE patient_name LIKE ? OR invoice_number LIKE ? OR registration LIKE ? ORDER BY id DESC LIMIT 100').all(q,q,q));
   }
   const match=url.pathname.match(/^\/api\/invoices\/(\d+)$/);
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
