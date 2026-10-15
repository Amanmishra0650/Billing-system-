import {CLINIC_ADDRESSES} from './clinic-addresses.js';

export function initInvoiceAddressPicker({id='invoice-address-dialog',title='Select invoice address',description='Choose the clinic address to print on this invoice.',confirmLabel='Save invoice'}={}){
 const dialog=document.createElement('dialog');
 dialog.id=id;dialog.className='invoice-address-dialog';
 dialog.setAttribute('aria-labelledby',`${id}-title`);
 dialog.setAttribute('aria-describedby',`${id}-description`);
 dialog.innerHTML=`<form><h2></h2><p></p><fieldset><legend>Clinic address (required)</legend></fieldset><div class="invoice-address-actions"><button class="secondary" type="button">Cancel</button><button class="primary" type="submit"></button></div></form>`;
 dialog.querySelector('h2').id=`${id}-title`;dialog.querySelector('h2').textContent=title;
 dialog.querySelector('p').id=`${id}-description`;dialog.querySelector('p').textContent=description;
 dialog.querySelector('[type=submit]').textContent=confirmLabel;
 const form=dialog.querySelector('form'),fieldset=dialog.querySelector('fieldset');
 for(const option of CLINIC_ADDRESSES){
  const label=document.createElement('label');label.className='invoice-address-option';
  const radio=document.createElement('input');radio.type='radio';radio.name='clinic_address_id';radio.value=option.id;radio.required=true;
  const details=document.createElement('span'),title=document.createElement('strong'),address=document.createElement('span');
  title.textContent=option.label;address.textContent=option.address;
  details.append(title,address);label.append(radio,details);fieldset.append(label);
 }
 document.body.append(dialog);
 let pending=null;
 form.onsubmit=event=>{event.preventDefault();dialog.close(new FormData(form).get('clinic_address_id'));};
 dialog.querySelector('[type=button]').onclick=()=>dialog.close('');
 dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close('');});
 dialog.addEventListener('close',()=>{const resolve=pending;pending=null;resolve?.(dialog.returnValue||null);});
 return function chooseAddress(){
  form.reset();dialog.returnValue='';dialog.showModal();
  return new Promise(resolve=>{pending=resolve;});
 };
}
