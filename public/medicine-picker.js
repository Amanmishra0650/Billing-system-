let nextPicker=0;

export function setMedicineRow(row,medicine) {
  row.dataset.medicineId=medicine.id;row.dataset.medicineName=medicine.name;row.dataset.taxPercentage=String(Number(medicine.tax_percentage));
  const name=row.querySelector('.description');name.value=medicine.name;name.setCustomValidity('');
  row.querySelector('.unit-price').value=Number(medicine.selling_price).toFixed(2);
  row.querySelector('.quantity').value='1';
  row.querySelector('.medicine-picker-state').textContent=`Tax: ${Number(medicine.tax_percentage)}%`;
}

export function attachMedicinePicker(row,{openDrawer,onChange}) {
  const input=row.querySelector('.description'),type=row.querySelector('.item-type'),price=row.querySelector('.unit-price');
  input.id=`medicine-picker-${++nextPicker}`;
  const state=document.createElement('span');state.className='medicine-picker-state';input.parentElement.append(state);
  const medicine=()=>type.value==='Medicine';
  function configure(switched=false){
    if(switched){input.value='';price.value='';delete row.dataset.medicineId;delete row.dataset.medicineName;delete row.dataset.taxPercentage;state.textContent='';}
    input.readOnly=medicine();price.readOnly=medicine();
    if(medicine()){
      input.setAttribute('role','combobox');input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-controls','medicine-drawer');input.setAttribute('aria-expanded','false');input.autocomplete='off';input.placeholder='Search active medicines';
      input.setCustomValidity(row.dataset.medicineId?'':'Choose an active medicine from the medicine panel.');
    }else{
      for(const attr of ['role','aria-haspopup','aria-controls','aria-expanded'])input.removeAttribute(attr);
      input.placeholder='Treatment or service name';input.setCustomValidity('');
    }
  }
  type.addEventListener('change',()=>{configure(true);onChange();});
  input.addEventListener('click',()=>{if(medicine())openDrawer(input);});
  input.addEventListener('keydown',event=>{if(medicine()&&['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault();openDrawer(input);}});
  configure();
}
