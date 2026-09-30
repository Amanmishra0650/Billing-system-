import { renderOpdSlip } from './opd-print.js';
export function initOpd({$,api,esc,fmt,view,showInvoice,prepareInvoice,words}) {
  let selectedPatient=null, currentVisit=null, optionsReady=false, searchVersion=0, historyVersion=0;
  const modes='<option value="">Select payment mode</option><option>CASH</option><option>UPI</option><option>CARD</option><option>BANK TRANSFER</option><option>OTHER</option>';
  document.querySelector('main').insertAdjacentHTML('beforeend',`
    <section id="opd-editor" hidden>
      <div class="page-head"><div><span class="eyebrow">OUTPATIENT DESK</span><h1>New OPD registration</h1><p>One patient profile. A clear record of every visit.</p></div><span class="desk-badge">OPD</span></div>
      <div class="editor-grid"><form id="opd-form" class="panel">
        <div class="panel-title"><span class="number">01</span><h2>Patient details</h2></div>
        <div class="patient-lookup"><label for="patient-search">Find a returning patient</label><input id="patient-search" type="search" placeholder="Search by UID, name or mobile" autocomplete="off"><p id="patient-search-state" class="hint" role="status">Search first to reuse an existing patient UID.</p><div id="patient-matches" class="patient-matches"></div></div>
        <div id="selected-patient" class="context-notice" hidden></div>
        <div class="fields" id="patient-fields">
          <label class="wide">Patient name <input name="name" maxlength="100" required placeholder="Full name" autocomplete="off"></label>
          <label>Mobile number <input name="mobile" type="tel" maxlength="20" placeholder="Mobile number" autocomplete="off"></label>
          <label>Age <input name="age" type="number" min="0" max="120" step="1" placeholder="Years"></label>
          <label>Gender <select name="gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label class="wide">Address <input name="address" maxlength="300" placeholder="Area, city or full address" autocomplete="off"></label>
        </div>
        <div id="duplicate-patient" class="duplicate-notice" hidden><p>We found a possible existing patient. Choose a match above, or confirm these details belong to someone else.</p><label class="checkbox-label"><input id="confirm-distinct" type="checkbox"> This is a different patient</label></div>
        <div class="panel-title spaced"><span class="number">02</span><h2>Visit details</h2></div>
        <div class="fields">
          <label>Visit date &amp; time <input name="visited_at" type="datetime-local" required></label>
          <label>Doctor <select name="doctor_id" required><option value="">Loading doctors…</option></select></label>
          <label class="wide">Illness <select name="illness_code" required><option value="">Select illness</option></select></label>
          <label id="custom-illness-label" class="wide" hidden>Other illness <input name="custom_illness" maxlength="140" placeholder="Describe the illness"></label>
        </div>
        <div class="panel-title spaced"><span class="number">03</span><h2>Consultation &amp; payment</h2></div>
        <div class="fields">
          <label>Consultation fee (₹) <input name="consultation_fee" type="number" min="0" max="1000000" step="0.01" required placeholder="0.00"><small>Before CGST and SGST.</small></label>
          <label>Payment status <select name="payment_status"><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select></label>
          <label id="opd-payment-mode-label" class="wide" hidden>Payment mode <select name="payment_mode">${modes}</select></label>
        </div>
        <div class="actions"><button class="primary" id="save-opd" type="submit">Save OPD registration</button><span id="opd-form-message" class="error" role="alert"></span></div>
      </form>
      <aside class="summary panel"><span class="eyebrow">VISIT SUMMARY</span><h2>Consultation total</h2><div class="sumrow"><span>Consultation fee</span><strong id="opd-subtotal">₹0.00</strong></div><div class="sumrow"><span>CGST (9%)</span><strong id="opd-cgst">₹0.00</strong></div><div class="sumrow"><span>SGST (9%)</span><strong id="opd-sgst">₹0.00</strong></div><div class="sumrow grand"><span>Total</span><strong id="opd-total">₹0.00</strong></div><div class="sumrow"><span>Amount received</span><strong id="opd-received">₹0.00</strong></div><p class="hint">Save the visit first. You can create its invoice from the visit details.</p><div class="summary-note"><strong>Returning patient?</strong><p>The patient keeps the same UID. Every visit receives its own OPD number.</p></div></aside></div>
    </section>
    <section id="opd-history" hidden><div class="page-head"><div><span class="eyebrow">PATIENT VISITS</span><h1>OPD history</h1><p>Find previous visits, consultation details and linked invoices.</p></div><button id="opd-history-new" class="primary" type="button">+ New registration</button></div><div class="panel"><label class="search-label">Search OPD visits<input id="opd-search" type="search" placeholder="Patient, UID, mobile, OPD, doctor or illness"></label><div class="table-wrap"><table><thead><tr><th>Visit</th><th>Patient</th><th>Doctor / illness</th><th>Consultation</th><th>Payment at registration</th><th></th></tr></thead><tbody id="opd-rows"></tbody></table></div><p id="opd-history-state" class="hint" role="status">No visits yet. Register a patient to get started.</p></div></section>
    <section id="opd-detail" hidden><div class="page-head"><button id="opd-back" class="subtle" type="button">← OPD history</button><button id="opd-print" class="subtle" type="button">Print OPD / Save as PDF</button><button id="opd-invoice" class="primary" type="button">Create invoice</button></div><div id="opd-detail-content"></div><article id="opd-paper" class="invoice-paper"></article><p id="opd-detail-error" class="error" role="alert"></p></section>
  `);
  const form=$('opd-form'), field=name=>form.elements[name];
  function localNow() { const now=new Date(); return new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  const dateText=value=>new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
  function updateSummary() {
    const fee=Math.round(Number(field('consultation_fee').value||0)*100), tax=Math.round(fee*0.09), total=fee+tax*2, paid=field('payment_status').value==='paid';
    for (const [id,value] of Object.entries({subtotal:fee,cgst:tax,sgst:tax,total,received:paid?total:0})) $('opd-'+id).textContent=fmt(value);
    $('opd-payment-mode-label').hidden=!paid;field('payment_mode').required=paid;
  }
  function patientFieldsDisabled(disabled) { $('patient-fields').querySelectorAll('input,select').forEach(el=>el.disabled=disabled); }
  function clearPatient() {
    selectedPatient=null; patientFieldsDisabled(false);
    for (const name of ['name','mobile','age','gender','address']) field(name).value='';
    $('selected-patient').hidden=true; $('duplicate-patient').hidden=true;$('confirm-distinct').checked=false;
  }
  function selectPatient(patient) {
    searchVersion++;
    selectedPatient=patient;
    for(const name of ['name','mobile','age','gender','address']) field(name).value=patient[name]||'';
    patientFieldsDisabled(true);
    $('selected-patient').hidden=false;
    $('selected-patient').innerHTML=`<div><strong>${esc(patient.name)}</strong><span>${esc(patient.patient_uid)} · Returning patient</span></div><button id="change-patient" class="subtle" type="button">Change patient</button>`;
    $('change-patient').onclick=()=>{clearPatient();$('patient-search').focus();};
    $('patient-matches').replaceChildren();$('duplicate-patient').hidden=true;$('confirm-distinct').checked=false;
    $('patient-search-state').textContent='Existing patient selected. Their permanent UID will be reused.';
  }
  function renderMatches(matches) {
    $('patient-matches').innerHTML=matches.map(p=>`<button type="button" class="patient-match" data-id="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>${esc(p.patient_uid)}${p.mobile?' · '+esc(p.mobile):''}</small></span><span class="match-action">Select →</span></button>`).join('');
    $('patient-matches').querySelectorAll('button').forEach(button=>button.onclick=()=>selectPatient(matches.find(p=>p.id===button.dataset.id)));
  }
  async function loadOptions() {
    if(optionsReady) return;
    $('save-opd').disabled=true;
    try {
      const [doctors,illnesses]=await Promise.all([api('/api/doctors'),api('/api/illnesses')]);
      field('doctor_id').innerHTML='<option value="">Select doctor</option>'+doctors.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
      field('illness_code').innerHTML='<option value="">Select illness</option>'+illnesses.map(i=>`<option value="${esc(i.code)}">${esc(i.name)}</option>`).join('');
      optionsReady=true;
    } catch(error) { $('opd-form-message').textContent=error.message; }
    finally { $('save-opd').disabled=!optionsReady; }
  }
  async function newVisit(reset=false) {
    if(reset) {
      searchVersion++;
      form.reset();clearPatient();field('visited_at').value=localNow();
      $('patient-search').value='';$('patient-matches').replaceChildren();$('patient-search-state').textContent='Search first to reuse an existing patient UID.';
      $('opd-form-message').textContent='';$('custom-illness-label').hidden=true;field('custom_illness').required=false;
    }
    if(!field('visited_at').value) field('visited_at').value=localNow();
    view('opd-editor');updateSummary();await loadOptions();
  }
  let lookupTimer;
  $('patient-search').oninput=()=>{
    clearTimeout(lookupTimer); const version=++searchVersion,q=$('patient-search').value.trim();
    $('patient-matches').replaceChildren();
    if(q.length<2) { $('patient-search-state').textContent='Enter at least 2 characters to find a patient.';return; }
    $('patient-search-state').textContent='Searching patients…';
    lookupTimer=setTimeout(async()=>{
      try { const matches=await api('/api/patients?q='+encodeURIComponent(q)); if(version!==searchVersion)return; renderMatches(matches);$('patient-search-state').textContent=matches.length?'Select a patient below to reuse their UID.':'No matching patient. Enter new patient details below.'; }
      catch(error) { if(version===searchVersion)$('patient-search-state').textContent=error.message; }
    },250);
  };
  field('illness_code').onchange=()=>{const other=field('illness_code').value==='other';$('custom-illness-label').hidden=!other;field('custom_illness').required=other;};
  form.addEventListener('input',updateSummary);form.addEventListener('change',updateSummary);
  $('patient-fields').addEventListener('input',()=>{$('confirm-distinct').checked=false;});
  form.onsubmit=async event=>{
    event.preventDefault();$('opd-form-message').textContent='';$('save-opd').disabled=true;
    form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
    const data={patient_id:selectedPatient?.id,patient:selectedPatient?undefined:{name:field('name').value,mobile:field('mobile').value,age:field('age').value,gender:field('gender').value,address:field('address').value,confirm_distinct_patient:$('confirm-distinct').checked},visited_at:new Date(field('visited_at').value).toISOString(),doctor_id:field('doctor_id').value,illness_code:field('illness_code').value,custom_illness:field('custom_illness').value,consultation_fee_paise:Math.round(Number(field('consultation_fee').value)*100),payment_status:field('payment_status').value,payment_mode:field('payment_mode').value};
    try { const visit=await api('/api/opd-visits',{method:'POST',body:JSON.stringify(data)});form.reset();clearPatient();field('visited_at').value='';field('custom_illness').required=false;$('custom-illness-label').hidden=true;showVisit(visit); }
    catch(error) {
      $('opd-form-message').textContent=error.message;
      for(const key of Object.keys(error.fields||{})) { const el=field(key==='consultation_fee_paise'?'consultation_fee':key); if(el) el.setAttribute('aria-invalid','true'); }
      if(error.matches) { renderMatches(error.matches);$('duplicate-patient').hidden=false;$('patient-matches').scrollIntoView({behavior:'smooth',block:'center'}); }
    } finally { $('save-opd').disabled=false; }
  };
  async function history() {
    view('opd-history');const version=++historyVersion;$('opd-history-state').hidden=false;$('opd-history-state').textContent='Loading visits…';
    try {
      const records=await api('/api/opd-visits?q='+encodeURIComponent($('opd-search').value));if(version!==historyVersion)return;
      $('opd-rows').innerHTML=records.map(v=>`<tr><td><strong>${esc(v.opd_number)}</strong><small>${esc(dateText(v.visited_at))}</small></td><td>${esc(v.patient_name)}<small>${esc(v.patient_uid)}${v.mobile?' · '+esc(v.mobile):''}</small></td><td>${esc(v.doctor_name)}<small>${esc(v.illness_text)}</small></td><td>${fmt(v.consultation_fee_paise)}<small>Before tax</small></td><td><span class="pill ${v.payment_status==='unpaid'?'pill-unpaid':''}">${v.payment_status==='paid'?'Paid':'Unpaid'}</span>${v.invoice_number?`<small>${esc(v.invoice_number)}</small>`:''}</td><td><button class="open" type="button" data-id="${esc(v.id)}">Open →</button></td></tr>`).join('');
      $('opd-history-state').textContent='No visits found. Try another search or create a registration.';$('opd-history-state').hidden=!!records.length;
      $('opd-rows').querySelectorAll('button').forEach(button=>button.onclick=async()=>{button.disabled=true;try{showVisit(await api('/api/opd-visits/'+button.dataset.id));}catch(error){$('opd-history-state').hidden=false;$('opd-history-state').textContent=error.message;}finally{button.disabled=false;}});
    }catch(error){if(version===historyVersion){$('opd-history-state').textContent=error.message;$('opd-rows').replaceChildren();}}
  }
  function showVisit(visit) {
    currentVisit=visit;const total=visit.consultation_total_paise;
    $('opd-paper').innerHTML=renderOpdSlip(visit,{esc,fmt,words});
    $('opd-detail-error').textContent='';
    $('opd-detail-content').innerHTML=`<div class="visit-heading"><div><span class="eyebrow">OPD VISIT</span><h1>${esc(visit.opd_number)}</h1><p>${esc(dateText(visit.visited_at))}</p></div><span class="pill ${visit.payment_status==='unpaid'?'pill-unpaid':''}">${visit.payment_status==='paid'?'Paid':'Unpaid'} at registration</span></div><div class="visit-detail-grid"><div class="panel"><div class="panel-title"><span class="number">01</span><h2>Patient</h2></div><h2 class="patient-name">${esc(visit.patient_name)}</h2><p class="uid-label">${esc(visit.patient_uid)}</p><dl class="detail-list"><dt>Mobile</dt><dd>${esc(visit.mobile||'—')}</dd><dt>Age / Gender</dt><dd>${esc(visit.age||'—')} / ${esc(visit.gender||'—')}</dd><dt>Address</dt><dd>${esc(visit.address||'—')}</dd></dl></div><div class="panel"><div class="panel-title"><span class="number">02</span><h2>Consultation</h2></div><dl class="detail-list"><dt>Doctor</dt><dd>${esc(visit.doctor_name)}</dd><dt>Illness</dt><dd>${esc(visit.illness_text)}</dd><dt>Visit note</dt><dd>${esc(visit.note||'—')}</dd><dt>Consultation fee</dt><dd>${fmt(visit.consultation_fee_paise)}</dd><dt>Total with taxes</dt><dd>${fmt(total)}</dd><dt>Received at OPD</dt><dd>${fmt(visit.payment_status==='paid'?total:0)}</dd><dt>Payment mode</dt><dd>${esc(visit.payment_mode||'Unpaid')}</dd></dl></div></div><div class="panel linked-invoice"><div><span class="eyebrow">BILLING</span><h2>${visit.invoice?esc(visit.invoice.invoice_number):'Ready for an invoice'}</h2><p>${visit.invoice?`Invoice ${visit.invoice.voided_at?'voided':`balance: ${fmt(visit.invoice.balance_paise)}`}. Open Billing to view payment history and print.`:'Create an invoice with the patient and consultation already filled in. It is issued only when you choose Save invoice.'}</p></div><span class="pill">${visit.invoice?'Linked':'Not issued'}</span></div>`;
    $('opd-invoice').textContent=visit.invoice?'Open invoice':'Create invoice';view('opd-detail');window.scrollTo(0,0);
  }
  $('opd-print').onclick=()=>window.print();
  $('opd-invoice').onclick=async()=>{
    $('opd-invoice').disabled=true;
    try { currentVisit=await api('/api/opd-visits/'+currentVisit.id);if(currentVisit.invoice)showInvoice(currentVisit.invoice);else prepareInvoice(currentVisit); }
    catch(error){$('opd-detail-error').textContent=error.message;}
    finally{$('opd-invoice').disabled=false;}
  };
  $('opd-tab').onclick=()=>newVisit();$('opd-new-tab').onclick=()=>newVisit(true);$('opd-history-new').onclick=()=>newVisit(true);
  $('opd-history-tab').onclick=history;$('opd-back').onclick=history;
  let historyTimer;$('opd-search').oninput=()=>{clearTimeout(historyTimer);historyVersion++;historyTimer=setTimeout(history,250);};
}
