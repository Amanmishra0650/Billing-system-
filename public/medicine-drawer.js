export function initMedicineDrawer({api,fmt,getRows,addMedicine,removeMedicine}) {
  const dialog=document.createElement('dialog');
  dialog.id='medicine-drawer';dialog.className='medicine-drawer';dialog.setAttribute('aria-labelledby','medicine-drawer-title');
  dialog.innerHTML=`<div class="medicine-drawer-header"><div><span class="eyebrow">INVOICE MEDICINES</span><h2 id="medicine-drawer-title">Select medicines</h2><p>Choose medicines to add to this invoice.</p></div><button class="medicine-drawer-x" type="button" aria-label="Close medicine drawer">&times;</button></div>
    <div id="medicine-drawer-total" role="status" hidden></div>
    <div class="medicine-drawer-search"><label for="medicine-drawer-search">Search medicines</label><input id="medicine-drawer-search" type="search" placeholder="Search by medicine name" autocomplete="off"></div>
    <div class="medicine-drawer-content"><p id="medicine-drawer-state" role="status"></p><button id="medicine-drawer-retry" class="secondary" type="button" hidden>Retry</button><div id="medicine-drawer-cards"></div></div>
    <div class="medicine-drawer-footer"><span id="medicine-drawer-count" role="status"></span><button class="primary medicine-drawer-close" type="button">Close</button></div>`;
  document.body.append(dialog);
  const search=dialog.querySelector('#medicine-drawer-search'),cards=dialog.querySelector('#medicine-drawer-cards'),state=dialog.querySelector('#medicine-drawer-state'),retry=dialog.querySelector('#medicine-drawer-retry'),count=dialog.querySelector('#medicine-drawer-count');
  let medicines=[],trigger=null,version=0,loading=false,failed=false,selectionError='';
  const selected=()=>new Set(getRows().filter(row=>row.querySelector('.item-type').value==='Medicine'&&row.dataset.medicineId).map(row=>row.dataset.medicineId));
  function sync(){
    if(!dialog.open)return;
    const ids=selected();count.textContent=`${ids.size} medicine${ids.size===1?'':'s'} selected`;
    cards.querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=ids.has(input.dataset.medicineId);});
  }
  function render(){
    const total=dialog.querySelector('#medicine-drawer-total');
    total.hidden=loading||failed;
    total.textContent=loading||failed?'':`Total medicines: ${medicines.length}`;
    cards.replaceChildren();retry.hidden=!failed;
    state.classList.toggle('error',failed||!!selectionError);
    if(loading){state.textContent='Loading medicines…';state.setAttribute('role','status');return;}
    if(failed)return;
    const term=search.value.trim().toLowerCase(),visible=medicines.filter(m=>m.name.toLowerCase().includes(term));
    state.setAttribute('role',selectionError?'alert':'status');
    state.textContent=selectionError || (!medicines.length?'No active medicines are available.':!visible.length?'No medicines match your search.':'');
    visible.forEach(m=>{
      const label=document.createElement('label');label.className='medicine-card';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.medicineId=m.id;checkbox.setAttribute('aria-label',m.name);
      const details=document.createElement('span');details.className='medicine-card-details';
      const name=document.createElement('strong');name.textContent=m.name;
      const price=document.createElement('span');price.textContent=`${fmt(Math.round(Number(m.selling_price)*100))} per unit`;
      details.append(name,price);label.append(checkbox,details);cards.append(label);
      checkbox.onchange=()=>{
        selectionError='';
        if(checkbox.checked){if(!addMedicine(m,trigger))selectionError='An invoice can contain up to 30 charges. Remove a charge before adding another medicine.';}
        else removeMedicine(m.id);
        sync();state.classList.toggle('error',!!selectionError);state.setAttribute('role',selectionError?'alert':'status');state.textContent=selectionError;
      };
    });sync();
  }
  async function load(){
    const current=++version;loading=true;failed=false;selectionError='';medicines=[];render();sync();
    try{
      const records=await api('/api/medicines?active=true');
      if(current!==version || !dialog.open)return;
      medicines=records.filter(m=>m.is_active===true);loading=false;render();
    }catch(error){
      if(current!==version || !dialog.open)return;
      loading=false;failed=true;render();state.setAttribute('role','alert');state.textContent=error.message;sync();
    }
  }
  function close(){if(dialog.open)dialog.close();}
  function open(field){
    if(dialog.open)return;
    trigger=field;trigger.setAttribute('aria-expanded','true');search.value='';dialog.showModal();document.body.classList.add('medicine-drawer-open');search.focus();load();
  }
  dialog.addEventListener('close',()=>{
    version++;document.body.classList.remove('medicine-drawer-open');trigger?.setAttribute('aria-expanded','false');
    if(trigger?.isConnected)trigger.focus();else document.getElementById('add-item')?.focus();
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.querySelector('.medicine-drawer-x').onclick=close;dialog.querySelector('.medicine-drawer-close').onclick=close;
  retry.onclick=load;search.oninput=()=>{selectionError='';render();};
  return {open,close,sync};
}
