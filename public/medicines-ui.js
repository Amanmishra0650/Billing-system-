export function initMedicines({api,view,esc,fmt}) {
  const $=id=>document.getElementById(id);
  document.querySelector('main').insertAdjacentHTML('beforeend',`
    <section id="medicine-editor" hidden>
      <div class="page-head"><div><span class="eyebrow">MEDICINE MASTER</span><h1 id="medicine-editor-title">Add Medicine</h1><p>Manage medicines for patient invoices.</p></div></div>
      <form id="medicine-form" class="panel medicine-form">
        <div class="panel-title"><span class="number">01</span><h2>Medicine Details</h2></div>
        <div class="fields">
          <label class="wide">Medicine Name<input name="name" maxlength="140" required placeholder="Enter medicine name"></label>
          <label>Selling Price in INR<input name="selling_price" type="number" min="0" max="1000000" step="0.01" required placeholder="0.00"></label>
          <label>Tax Percentage<input name="tax_percentage" type="number" min="0" max="100" step="0.01" value="0" placeholder="0"><small>Applied to medicines on future invoices.</small></label>
          <label class="checkbox-label wide"><input name="is_active" type="checkbox" checked>Active status</label>
        </div>
        <div class="actions"><button class="primary" type="submit">Save Medicine</button><button id="medicine-cancel" class="secondary" type="button">Cancel</button><span id="medicine-form-message" role="status"></span></div>
      </form>
    </section>
    <section id="medicine-list" hidden>
      <div class="page-head"><div><span class="eyebrow">MEDICINE MASTER</span><h1>Medicine List</h1><p>Edit current prices and availability. Saved invoices retain their original details.</p></div></div>
      <div class="panel medicine-list-panel"><label class="search-label">Search medicines<input id="medicine-search" type="search" placeholder="Search by medicine name" autocomplete="off"></label>
        <div class="table-wrap"><table><thead><tr><th>Medicine name</th><th>Selling price</th><th>Tax percentage</th><th>Status</th><th>Created date</th><th>Actions</th></tr></thead><tbody id="medicine-rows"></tbody></table></div>
        <p id="medicine-list-message" class="hint" role="status"></p>
      </div>
    </section>`);
  let editing=null,version=0,timer;
  const form=$('medicine-form'),message=$('medicine-form-message');
  function reset(){form.reset();message.textContent='';message.className='';form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));}
  function add(){editing=null;reset();$('medicine-editor-title').textContent='Add Medicine';view('medicine-editor');form.elements.name.focus();}
  async function list(success=''){
    const current=++version;
    $('medicine-list-message').textContent='Loading medicines…';$('medicine-list-message').classList.remove('error');
    $('medicine-rows').replaceChildren();
    try{
      const records=await api('/api/medicines?q='+encodeURIComponent($('medicine-search').value));
      if(current!==version)return;
      $('medicine-rows').innerHTML=records.map(m=>`<tr><td><strong>${esc(m.name)}</strong></td><td>${fmt(Math.round(Number(m.selling_price)*100))}</td><td>${Number(m.tax_percentage)}%</td><td><span class="pill ${m.is_active?'':'pill-inactive'}">${m.is_active?'Active':'Inactive'}</span></td><td>${new Date(m.created_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})}</td><td class="medicine-row-actions"><button class="open medicine-edit" type="button" data-id="${m.id}">Edit</button><button class="secondary medicine-status" type="button" data-id="${m.id}" data-active="${m.is_active}">${m.is_active?'Deactivate':'Activate'}</button></td></tr>`).join('');
      $('medicine-list-message').textContent=records.length?success:'No medicines found. Add a medicine to get started.';
      $('medicine-rows').querySelectorAll('.medicine-edit').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try{
          const m=await api('/api/medicines/'+button.dataset.id);editing=m.id;reset();
          form.elements.name.value=m.name;form.elements.selling_price.value=Number(m.selling_price).toFixed(2);form.elements.tax_percentage.value=Number(m.tax_percentage);form.elements.is_active.checked=m.is_active;
          $('medicine-editor-title').textContent='Edit Medicine';view('medicine-editor');form.elements.name.focus();
        }catch(error){$('medicine-list-message').textContent=error.message;$('medicine-list-message').classList.add('error');}finally{button.disabled=false;}
      });
      $('medicine-rows').querySelectorAll('.medicine-status').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try{await api(`/api/medicines/${button.dataset.id}/status`,{method:'PATCH',body:JSON.stringify({is_active:button.dataset.active!=='true'})});await list('Medicine status updated.');}
        catch(error){$('medicine-list-message').textContent=error.message;$('medicine-list-message').classList.add('error');}finally{button.disabled=false;}
      });
    }catch(error){if(current===version){$('medicine-list-message').textContent=error.message;$('medicine-list-message').classList.add('error');}}
  }
  function showList(){view('medicine-list');list();}
  $('medicine-tab').onclick=showList;$('medicine-add-tab').onclick=add;$('medicine-list-tab').onclick=showList;$('medicine-cancel').onclick=showList;
  $('medicine-search').oninput=()=>{version++;clearTimeout(timer);timer=setTimeout(()=>list(),180);};
  form.onsubmit=async event=>{
    event.preventDefault();message.textContent='';message.className='';form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
    const submit=form.querySelector('[type=submit]'),cancel=$('medicine-cancel');submit.disabled=true;cancel.disabled=true;
    const payload={name:form.elements.name.value,selling_price:form.elements.selling_price.value,tax_percentage:form.elements.tax_percentage.value||'0',is_active:form.elements.is_active.checked};
    try{
      await api(editing?'/api/medicines/'+editing:'/api/medicines',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});
      editing=null;reset();$('medicine-search').value='';view('medicine-list');await list('Medicine saved.');
    }catch(error){message.textContent=error.message;message.className='error';for(const field of Object.keys(error.fields||{}))form.elements[field]?.setAttribute('aria-invalid','true');}
    finally{submit.disabled=false;cancel.disabled=false;}
  };
}
