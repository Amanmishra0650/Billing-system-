export function initInvoicePatients({form,api,esc,isLinked}) {
  const field=name=>form.elements[name],name=field('patient_name'),uhid=field('registration');
  const label=name.closest('label'),wrapper=document.createElement('div');
  wrapper.className='wide invoice-patient-search';label.before(wrapper);wrapper.append(label);
  wrapper.insertAdjacentHTML('beforeend','<div id="invoice-patient-matches" class="patient-matches" role="listbox" aria-label="Matching patients" hidden></div><p id="invoice-patient-state" class="hint" role="status">Search by patient name, UHID or mobile (at least 2 characters).</p><div id="invoice-patient-selection" class="context-notice" hidden></div>');
  const results=wrapper.querySelector('#invoice-patient-matches'),status=wrapper.querySelector('#invoice-patient-state'),badge=wrapper.querySelector('#invoice-patient-selection');
  const header=document.createElement('div');header.className='invoice-uhid-search';
  header.innerHTML='<input type="search" placeholder="Search UHID…" aria-label="Search patient by UHID" role="combobox" aria-autocomplete="list" aria-controls="invoice-uhid-matches" aria-expanded="false" autocomplete="off"><div id="invoice-uhid-matches" class="patient-matches" role="listbox" aria-label="UHID search results" hidden></div><span class="hint" role="status"></span>';
  form.querySelector('.patient-panel .panel-title').append(header);
  const quick=header.querySelector('input'),quickResults=header.querySelector('#invoice-uhid-matches'),quickStatus=header.querySelector('[role=status]');
  const extra=document.createElement('div');extra.className='wide invoice-patient-extra fields';
  extra.innerHTML='<label>Mobile number <input name="mobile" type="tel" maxlength="20" autocomplete="off"></label><label class="wide">Patient address <input name="address" maxlength="300" autocomplete="off"></label>';
  form.querySelector('.patient-panel .fields').append(extra);
  name.autocomplete='off';name.setAttribute('role','combobox');name.setAttribute('aria-autocomplete','list');name.setAttribute('aria-controls',results.id);name.setAttribute('aria-expanded','false');
  uhid.readOnly=true;uhid.placeholder='Generated when invoice is saved';
  document.getElementById('registration-note').textContent='Select an existing patient to reuse their UHID.';
  let selected=null,newChosen=false,needsDistinct=false,version=0,timer;
  const optional=['mobile','age','gender','address'];
  function hideResults(){results.hidden=true;quickResults.hidden=true;name.setAttribute('aria-expanded','false');quick.setAttribute('aria-expanded','false');}
  function syncRegistration(){uhid.value=selected?.patient_uid||'';}
  function clearDetails(){for(const key of optional)field(key).value='';}
  function clearSelection(){selected=null;newChosen=false;needsDistinct=false;badge.hidden=true;quick.value='';quickStatus.textContent='';syncRegistration();}
  function selectPatient(patient){
    clearTimeout(timer);version++;selected={...patient};newChosen=false;name.value=patient.name;
    for(const key of optional)field(key).value=patient[key]||'';
    quick.value=patient.patient_uid;quickStatus.textContent='';
    syncRegistration();hideResults();badge.hidden=false;
    badge.innerHTML='<div><strong>Existing Patient</strong><span>'+esc(patient.patient_uid)+'</span></div><button type="button" class="subtle">Change patient</button>';
    badge.querySelector('button').onclick=()=>{clearSelection();clearDetails();name.focus();name.select();name.dispatchEvent(new Event('input'));};
    status.textContent='Existing patient selected. Their permanent UHID will be reused.';
  }
  function chooseNew(distinct){
    clearTimeout(timer);version++;clearSelection();clearDetails();newChosen=true;hideResults();badge.hidden=false;
    needsDistinct=distinct;
    badge.innerHTML='<strong>New Patient</strong>'+(distinct?'<label class="checkbox-label"><input type="checkbox" id="invoice-distinct-patient"> I confirm this is a different person</label>':'');status.textContent='A permanent UHID will be generated only when the invoice is saved.';
  }
  function showMatches(matches,query=name.value.trim(),target=results,allowCreate=true){
    target.replaceChildren();
    for(const patient of matches){
      const button=document.createElement('button');button.type='button';button.className='patient-match';button.setAttribute('role','option');
      const last=patient.last_visit_at?new Date(patient.last_visit_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'No OPD visits';
      button.innerHTML=`<span><strong>${esc(patient.name)}</strong><small>${esc(patient.patient_uid)} | ${esc(patient.mobile||'No mobile')}</small><small>${esc(patient.age?patient.age+' Years':'Age unavailable')} | ${esc(patient.gender||'Gender unavailable')} | Last visit: ${esc(last)}</small></span><span class="match-action">Select</span>`;
      button.onclick=()=>selectPatient(patient);target.append(button);
    }
    if(allowCreate){const button=document.createElement('button');button.type='button';button.className='patient-match';button.textContent=(matches.length?'Create different patient: ':'Create new patient: ')+query;button.onclick=()=>chooseNew(matches.length>0);target.append(button);}
    target.hidden=!matches.length&&!allowCreate;(target===results?name:quick).setAttribute('aria-expanded',String(!target.hidden));
    (target===results?status:quickStatus).textContent=matches.length?'Select the correct patient.':'No matching patient found.';
  }
  name.addEventListener('input',()=>{
    if(isLinked())return;
    clearTimeout(timer);const current=++version,query=name.value.trim();
    if(selected||newChosen){clearSelection();clearDetails();}
    hideResults();
    if(query.length<2){status.textContent='Enter at least 2 characters to search patients.';return;}
    status.textContent='Searching patients…';
    timer=setTimeout(async()=>{
      try{const matches=await api('/api/patients?q='+encodeURIComponent(query));if(current===version&&!isLinked())showMatches(matches,query);}
      catch(error){if(current===version)status.textContent=error.message;}
    },300);
  });
  name.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideResults();return;}
    if(event.key==='ArrowDown'&&!results.hidden){event.preventDefault();results.querySelector('button')?.focus();}
  });
  quick.addEventListener('input',()=>{
    if(isLinked())return;
    clearTimeout(timer);const current=++version,query=quick.value.trim();hideResults();
    if(query.length<2){quickStatus.textContent=query?'Enter at least 2 characters.':'';return;}
    quickStatus.textContent='Searching…';
    timer=setTimeout(async()=>{
      try{const matches=await api('/api/patients?q='+encodeURIComponent(query));if(current===version&&!isLinked())showMatches(matches,query,quickResults,false);}
      catch(error){if(current===version)quickStatus.textContent=error.message;}
    },300);
  });
  quick.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideResults();return;}
    if(['ArrowDown','Enter'].includes(event.key)){event.preventDefault();if(!quickResults.hidden)quickResults.querySelector('button')?.focus();}
  });
  quickResults.addEventListener('keydown',event=>{
    const buttons=[...quickResults.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){hideResults();quick.focus();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  });
  results.addEventListener('keydown',event=>{
    const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){hideResults();name.focus();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  });
  document.addEventListener('click',event=>{if(!wrapper.contains(event.target)&&!header.contains(event.target))hideResults();});
  form.addEventListener('input',event=>{if(needsDistinct&&optional.includes(event.target.name))badge.querySelector('input[type=checkbox]').checked=false;});
  function getPayload(){
    if(selected){
      const details=Object.fromEntries(optional.map(key=>[key,field(key).value.trim()]));
      const changed=optional.some(key=>details[key]!==String(selected[key]||''));
      if(changed&&!window.confirm('Update this existing patient’s details in the patient master? Previous invoice snapshots will stay unchanged.'))throw Error('Patient update cancelled. Review the details before saving.');
      return {patient_id:selected.id,patient_details:details,...(changed?{confirm_patient_update:true,patient_original:Object.fromEntries(optional.map(key=>[key,selected[key]||'']))}:{})};
    }
    if(!newChosen)throw Error('Search and select an existing patient, or choose Create new patient.');
    if(needsDistinct&&!badge.querySelector('input[type=checkbox]').checked)throw Error('Confirm this is a different person before creating another patient.');
    return {patient:{name:name.value.trim(),...Object.fromEntries(optional.map(key=>[key,field(key).value.trim()])),...(needsDistinct?{confirm_distinct_patient:true}:{})}};
  }
  function reset(){clearTimeout(timer);version++;clearSelection();hideResults();clearDetails();quick.disabled=false;extra.hidden=false;for(const key of optional)field(key).disabled=false;status.textContent='Search by patient name, UHID or mobile (at least 2 characters).';status.hidden=false;}
  function lockToVisit(visit){clearTimeout(timer);version++;hideResults();badge.hidden=true;status.hidden=true;quick.disabled=true;quick.value=visit.patient_uid;for(const key of ['mobile','address']){field(key).value=visit[key]||'';field(key).disabled=true;}}
  return {getPayload,reset,syncRegistration,lockToVisit,showMatches};
}
