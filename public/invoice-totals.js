// Shared browser/server arithmetic. Money is integer paise; percentages use basis points.
export function invoiceTotals(items,consultation=null) {
  const subtotal_paise=items.reduce((sum,x)=>sum+x.amount_paise,0);
  const discount_bps=consultation?.discount_bps || 0;
  const discount_paise=Math.round((consultation?.consultation_fee_paise || 0)*discount_bps/10000);
  let medicineCgst=0,medicineSgst=0,nonMedicine=0;
  const lines=items.map(item=>{
    if(!item.medicine_id){nonMedicine+=item.amount_paise;return {...item};}
    const tax_amount_paise=Math.round(item.amount_paise*Math.round(Number(item.tax_percentage)*100)/10000);
    const half=Math.floor(tax_amount_paise/2);
    medicineCgst+=half;medicineSgst+=tax_amount_paise-half;
    return {...item,tax_amount_paise,final_amount_paise:item.amount_paise+tax_amount_paise};
  });
  if(consultation?.tax_rate_bps===0)nonMedicine-=consultation.consultation_fee_paise;
  const legacyTax=Math.round(nonMedicine*900/10000);
  const cgst_paise=legacyTax+medicineCgst,sgst_paise=legacyTax+medicineSgst;
  const hasTax=cgst_paise+sgst_paise>0;
  // Keep the legacy header field for existing service invoices. Medicine invoices use per-line rates.
  const tax_rate_bps=items.some(x=>x.medicine_id)?(hasTax?900:0):(consultation?.tax_rate_bps===0 && items.length===1?0:900);
  return {subtotal_paise,discount_bps,discount_paise,cgst_paise,sgst_paise,tax_rate_bps,total_paise:subtotal_paise-discount_paise+cgst_paise+sgst_paise,items:lines};
}
