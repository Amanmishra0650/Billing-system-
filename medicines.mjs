import { randomUUID } from 'node:crypto';
import { AppError, invalid, isUuid } from './opd.mjs';

function decimal(value,field,label,max) {
  if(!['string','number'].includes(typeof value) || (typeof value==='number' && !Number.isFinite(value))) invalid(field,`Enter a valid ${label}`);
  const text=String(value).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text)>max) invalid(field,`Enter a ${label} from 0 to ${max} with at most two decimal places`);
  return Number(text).toFixed(2);
}
export function validateMedicine(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) invalid('name','Enter medicine details');
  const name=typeof input.name==='string'?input.name.trim():'';
  if(!name || name.length>140) invalid('name','Medicine name is required and must be at most 140 characters');
  const selling_price=decimal(input.selling_price,'selling_price','selling price',1000000);
  const tax_percentage=decimal(input.tax_percentage===undefined?0:input.tax_percentage,'tax_percentage','tax percentage',100);
  const is_active=input.is_active===undefined?true:input.is_active;
  if(typeof is_active!=='boolean') invalid('is_active','Active status must be true or false');
  return {name,selling_price,tax_percentage,is_active};
}
function missing() {throw new AppError('Medicine not found',404);}
async function write(db,sql,values) {
  try {
    const row=(await db.query(sql,values)).rows[0];
    if(!row)missing();
    return row;
  }catch(error){
    if(error.code==='23505')throw new AppError('A medicine with this name already exists',409,{name:'A medicine with this name already exists'});
    throw error;
  }
}
export async function createMedicine(db,input) {
  const m=validateMedicine(input),now=new Date().toISOString();
  return write(db,'INSERT INTO medicines(id,name,selling_price,tax_percentage,is_active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *',[randomUUID(),m.name,m.selling_price,m.tax_percentage,m.is_active,now]);
}
export async function listMedicines(db,{q='',active=null}={}) {
  if(active!==null && !['true','false'].includes(active)) invalid('active','Active filter must be true or false');
  const term='%'+String(q??'').trim().slice(0,140).replace(/[\\%_]/g,'\\$&')+'%';
  return (await db.query('SELECT * FROM medicines WHERE name ILIKE $1 AND ($2::boolean IS NULL OR is_active=$2::boolean) ORDER BY lower(name),id',[term,active===null?null:active==='true'])).rows;
}
export async function getMedicine(db,id) {
  if(!isUuid(id))missing();
  const row=(await db.query('SELECT * FROM medicines WHERE id=$1',[id])).rows[0];
  if(!row)missing();return row;
}
export async function updateMedicine(db,id,input) {
  if(!isUuid(id))missing();
  const m=validateMedicine(input);
  return write(db,'UPDATE medicines SET name=$2,selling_price=$3,tax_percentage=$4,is_active=$5,updated_at=$6 WHERE id=$1 RETURNING *',[id,m.name,m.selling_price,m.tax_percentage,m.is_active,new Date().toISOString()]);
}
export async function setMedicineStatus(db,id,input) {
  if(!isUuid(id))missing();
  if(typeof input?.is_active!=='boolean')invalid('is_active','Active status must be true or false');
  return write(db,'UPDATE medicines SET is_active=$2,updated_at=$3 WHERE id=$1 RETURNING *',[id,input.is_active,new Date().toISOString()]);
}

export async function resolveMedicineItems(tx,input) {
  if(!Array.isArray(input) || input.length<1 || input.length>30)invalid('items','Add 1 to 30 charges');
  const charges=input.map(item=>{
    if(!item || typeof item!=='object' || Array.isArray(item))invalid('items','Enter valid charge details');
    const type=item.type===undefined?'Treatment':item.type;
    if(typeof type!=='string' || !['Medicine','Treatment','Service'].includes(type.trim()))invalid('items','Select a valid item type');
    return {...item,type:type.trim()};
  });
  // Stable lock order prevents deadlocks when two invoices select medicines in opposite orders.
  const requested=charges.filter(x=>x.type==='Medicine').map(x=>x.medicine_id);
  for(const id of requested)if(!isUuid(id))invalid('items','Select an active medicine from the Medicine Master');
  const ids=[...new Set(requested.map(id=>id.toLowerCase()))].sort();
  if(ids.length!==requested.length)invalid('items','Each medicine can be added only once; change its quantity instead');
  const records=ids.length?(await tx.query('SELECT * FROM medicines WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[ids])).rows:[];
  const masters=new Map(records.map(m=>[m.id,m]));
  return charges.map(item=>{
    if(item.type!=='Medicine')return {...item,medicine_id:null,medicine_name:null,tax_percentage:null};
    const m=masters.get(item.medicine_id.toLowerCase());
    if(!m?.is_active)invalid('items','Select an active medicine from the Medicine Master');
    if(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000)invalid('items','Enter a valid medicine quantity');
    const price=Math.round(Number(m.selling_price)*100),tax=Number(m.tax_percentage);
    if((item.unit_price_paise!==undefined && item.unit_price_paise!==price) ||
      (item.tax_percentage!==undefined && (typeof item.tax_percentage!=='number'||item.tax_percentage!==tax)) ||
      (item.medicine_name!==undefined && item.medicine_name!==m.name) ||
      (item.description!==undefined && item.description!==m.name)) {
      throw new AppError('Medicine details changed. Refresh and reselect the medicine before saving.',409,{items:'Refresh and reselect the medicine before saving.'});
    }
    return {...item,type:'Medicine',medicine_id:m.id,medicine_name:m.name,description:m.name,unit_price_paise:price,tax_percentage:tax};
  });
}
