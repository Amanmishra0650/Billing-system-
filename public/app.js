import { initOpd } from './opd-ui.js';
import { initMedicines } from './medicines-ui.js';
import { attachMedicinePicker,setMedicineRow } from './medicine-picker.js';
import { initMedicineDrawer } from './medicine-drawer.js';
import { invoiceTotals } from './invoice-totals.js';
import { CLINIC_ADDRESSES } from './clinic-addresses.js';
import { initInvoiceAddressPicker } from './invoice-address.js';
const chooseInvoiceAddress=initInvoiceAddressPicker();
const $ = (id) => document.getElementById(id);
let linkedVisit = null;
const fmt = (p) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    p / 100,
  );
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const rupees = (v) => Math.round(Number(v || 0) * 100);
async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const d = await r.json();
  if (!r.ok) { const error = Error(d.error || "Request failed"); error.fields=d.fields; error.matches=d.matches; error.status=r.status; throw error; }
  return d;
}
async function fillRegistration() {
  if (linkedVisit) { $("registration").value=linkedVisit.patient_uid; return; }
  const field = $("registration");
  try {
    const data = await api("/api/registration-preview");
    if (!linkedVisit) field.value = data.registration;
  } catch {
    field.value = "";
    field.placeholder = "Generated when saved";
  }
}
function view(name) {
  medicineDrawer.close();
  if (name === "editor") fillRegistration();
  for (const n of ["editor", "history", "detail", "opd-editor", "opd-history", "opd-detail", "medicine-editor", "medicine-list"]) if ($(n)) $(n).hidden = n !== name;
  const opd = name.startsWith('opd-');
  const medicine = name.startsWith('medicine-');
  for(const [tab,navigation,active] of [['billing-tab','billing-navigation',!opd&&!medicine],['opd-tab','opd-navigation',opd],['medicine-tab','medicine-navigation',medicine]]) {
    $(tab).classList.toggle('active',active);
    $(tab).setAttribute('aria-expanded',String(active));
    $(navigation).hidden=!active;
  }
  $("new-tab").classList.toggle("active", name === "editor");
  $("history-tab").classList.toggle("active", name === "history" || name === "detail");
  if($('medicine-add-tab'))$('medicine-add-tab').classList.toggle('active',name==='medicine-editor');
  if($('medicine-list-tab'))$('medicine-list-tab').classList.toggle('active',name==='medicine-list');
  if ($('opd-new-tab')) {
    $('opd-new-tab').classList.toggle('active',name==='opd-editor');
    $('opd-history-tab').classList.toggle('active',name==='opd-history'||name==='opd-detail');
  }
}
const medicineDrawer=initMedicineDrawer({api,fmt,getRows:()=>[...$('items').querySelectorAll('.item-row')],addMedicine,removeMedicine});
function addMedicine(medicine,trigger) {
  const rows=[...$('items').querySelectorAll('.item-row')];
  if(rows.some(row=>row.dataset.medicineId===medicine.id))return true;
  const empty=row=>row?.isConnected&&row.querySelector('.item-type').value==='Medicine'&&!row.dataset.medicineId;
  if(rows.filter(row=>!empty(row)).length>=30)return false;
  let row=trigger?.closest('.item-row');if(!empty(row))row=rows.find(empty);
  if(!row){if(rows.length>=30)return false;row=itemRow();}
  setMedicineRow(row,medicine);
  // Blank placeholders are not invoice charges and must not block Save.
  rows.filter(other=>other!==row&&empty(other)).forEach(other=>other.remove());
  update();return true;
}
function removeMedicine(id) {
  $('items').querySelectorAll('.item-row').forEach(row=>{if(row.dataset.medicineId===id)row.remove();});
  if(!$('items').children.length)itemRow();update();
}
function itemRow(
  description = "",
  unitPrice = "",
  quantity = 1,
  type = "Medicine",
) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `<label>Type<select class="item-type"><option${type === "Medicine" ? " selected" : ""}>Medicine</option><option${type === "Treatment" ? " selected" : ""}>Treatment</option><option${type === "Service" ? " selected" : ""}>Service</option></select></label><label>Name<input class="description" maxlength="140" required placeholder="Medicine or treatment name" value="${esc(description)}"></label><label>Qty<input class="quantity" type="number" min="1" max="10000" step="1" required value="${esc(quantity)}"></label><label>Unit price (₹)<input class="unit-price" type="number" min="0" max="1000000" step="0.01" required placeholder="0.00" value="${esc(unitPrice)}"></label><div class="line-total"><span>Amount</span><strong>₹0.00</strong></div><button type="button" class="remove" aria-label="Remove charge">×</button>`;
  row.querySelector(".remove").onclick = () => {
    row.remove();
    if(!$('items').children.length)itemRow();
    update();
  };
  row.addEventListener("input", update);
  row.addEventListener("change", update);
  $("items").append(row);
  attachMedicinePicker(row,{openDrawer:medicineDrawer.open,onChange:update});
  update();
  return row;
}
function update() {
  const items=[];
  document.querySelectorAll(".item-row").forEach((row) => {
    const amount =
      rupees(row.querySelector(".unit-price").value) *
      (Number(row.querySelector(".quantity").value) || 0);
    row.querySelector(".line-total strong").textContent = fmt(amount);
    row.querySelector('.line-total span').textContent='Amount';
    items.push({type:row.querySelector('.item-type').value,medicine_id:row.dataset.medicineId||null,amount_paise:amount,tax_percentage:Number(row.dataset.taxPercentage||0)});
  });
  const totals=invoiceTotals(items,linkedVisit);
  const subtotal=totals.subtotal_paise,discount=totals.discount_paise,total=totals.total_paise;
  $('invoice-discount-row').hidden=!linkedVisit;
  $('invoice-discount').textContent=fmt(discount);
  const mixed=items.some(x=>x.medicine_id);
  for(const id of ['cgst','sgst']) {
    $(id).parentElement.hidden=totals.cgst_paise+totals.sgst_paise===0;
    $(id).parentElement.querySelector('span').textContent=id.toUpperCase()+(mixed?'':' (9%)');
  }
  for (const [id, value] of Object.entries({
    subtotal,
    cgst: totals.cgst_paise,
    sgst: totals.sgst_paise,
    total,
  }))
    $(id).textContent = fmt(value);
  if ($('opd-invoice-payment')) {
    $('opd-invoice-payment').hidden=!linkedVisit;
    if (linkedVisit) {
      const paid=linkedVisit.payment_status==='paid'?linkedVisit.consultation_total_paise:0;
      $('opd-invoice-payment').textContent=`Received at OPD: ${fmt(paid)} · Balance: ${fmt(Math.max(0,total-paid))}`;
    }
  }
  medicineDrawer.sync();
}
$("add-item").onclick = () => itemRow();
itemRow();
update();
$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    $("login").hidden = true;
    $("workspace").hidden = false;
    fillRegistration();
  } catch (err) {
    $("login-error").textContent = err.message;
  }
};
$("logout").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  $("workspace").hidden = true;
  $("login").hidden = false;
  location.reload();
};
$("invoice-form").onsubmit = async (e) => {
  e.preventDefault();
  $("form-message").textContent = "";
  const fd = new FormData(e.target);
  const items = [...document.querySelectorAll(".item-row")].map((row) => ({
    type: row.querySelector(".item-type").value,
    description: row.querySelector(".description").value,
    quantity: Number(row.querySelector(".quantity").value),
    unit_price_paise: rupees(row.querySelector(".unit-price").value),
    ...(row.dataset.medicineId?{medicine_id:row.dataset.medicineId,medicine_name:row.dataset.medicineName,tax_percentage:Number(row.dataset.taxPercentage)}:{}),
  }));
  const payload = {
    patient_name: fd.get("patient_name"),
    age: fd.get("age"),
    gender: fd.get("gender"),
    payment_mode: fd.get("payment_mode"),
    paid_paise: 0,
    items,
  };
  const submit=e.target.querySelector('[type=submit]');
  submit.disabled=true;
  try {
    const address=await chooseInvoiceAddress();
    if(!address)return;
    payload.clinic_address_id=address;
    const saved = await api(linkedVisit ? `/api/opd-visits/${linkedVisit.id}/invoice` : "/api/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    resetInvoiceEditor();
    showInvoice(saved);
    fillRegistration();
  } catch (err) {
    $("form-message").textContent = err.message;
  } finally { submit.disabled=false; }
};
function paymentStatusControl(r) {
  if (r.voided_at) return '<span class="pill">Voided</span>';
  const status = r.received_paise >= r.total_paise ? 'paid' : r.received_paise > 0 ? 'partial' : 'unpaid';
  return `<select class="payment-status" data-id="${r.id}" data-current="${status}" aria-label="Payment status for ${esc(r.invoice_number)}"><option value="unpaid" ${status === 'unpaid' ? 'selected' : ''}>Unpaid</option>${status === 'partial' ? '<option value="partial" selected disabled>Partial</option>' : ''}<option value="paid" ${status === 'paid' ? 'selected' : ''}>Paid</option></select>`;
}
async function list() {
  try {
    const records = await api(
      "/api/invoices?q=" + encodeURIComponent($("search").value),
    );
    $("rows").innerHTML = records
      .map(
        (r) =>
          `<tr><td><strong>${esc(r.invoice_number)}</strong></td><td>${esc(r.patient_name)}<small>${esc(r.registration)}</small></td><td>${new Date(r.created_at).toLocaleDateString("en-IN")}</td><td>${fmt(r.total_paise)}</td><td>${paymentStatusControl(r)}</td><td><button class="open" data-id="${r.id}">Open →</button></td></tr>`,
      )
      .join("");
    $("history-empty").textContent = "No invoices found.";
    $("history-empty").hidden = !!records.length;
    document.querySelectorAll(".payment-status").forEach(select => {
      select.onchange = async () => {
        const status = select.value;
        const message = status === "paid"
          ? "Mark this invoice Paid and set the received amount to the full invoice total?"
          : "Mark this invoice Unpaid and reset the received amount to zero? Previous payment records will be preserved.";
        if (!confirm(message)) { select.value = select.dataset.current; return; }
        select.disabled = true;
        try {
          await api(`/api/invoices/${select.dataset.id}/payment-status`, { method: "POST", body: JSON.stringify({ status }) });
          await list();
        } catch (error) {
          select.value = select.dataset.current;
          $("history-empty").textContent = error.message;
          $("history-empty").hidden = false;
        } finally { select.disabled = false; }
      };
    });
    document
      .querySelectorAll("#rows .open")
      .forEach(
        (b) =>
          (b.onclick = async () =>
            showInvoice(await api("/api/invoices/" + b.dataset.id))),
      );
  } catch (err) {
    $("history-empty").textContent = err.message;
    $("history-empty").hidden = false;
  }
}
$("search").oninput = list;
$("history-tab").onclick = () => {
  view("history");
  list();
};
function resetInvoiceEditor() {
  medicineDrawer.close();
  linkedVisit=null;
  $('invoice-form').reset();
  for (const name of ['patient_name','age','gender','payment_mode']) $('invoice-form').elements[name].disabled=false;
  $('invoice-opd-notice').hidden=true;
  $('items').replaceChildren(); itemRow(); update();
}
$("new-tab").onclick = () => { resetInvoiceEditor(); view("editor"); };
$("create-from-history").onclick = $("new-tab").onclick;
$('billing-tab').onclick=()=>view('editor');
$("back-history").onclick = () => {
  view("history");
  list();
};
$("print").onclick = () => window.print();
const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
function words(n) {
  if (n < 20) return ones[n];
  if (n < 100)
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  if (n < 1000)
    return (
      ones[Math.floor(n / 100)] +
      " Hundred" +
      (n % 100 ? " " + words(n % 100) : "")
    );
  if (n < 100000)
    return (
      words(Math.floor(n / 1000)) +
      " Thousand" +
      (n % 1000 ? " " + words(n % 1000) : "")
    );
  if (n < 10000000)
    return (
      words(Math.floor(n / 100000)) +
      " Lakh" +
      (n % 100000 ? " " + words(n % 100000) : "")
    );
  return (
    words(Math.floor(n / 10000000)) +
    " Crore" +
    (n % 10000000 ? " " + words(n % 10000000) : "")
  );
}
function showInvoice(v) {
  v.items = v.items.map((x) => ({
    ...x,
    type: x.type || "Treatment",
    description: x.description,
    quantity: x.quantity || 1,
    unit_price_paise: x.unit_price_paise ?? x.amount_paise,
    amount_paise: x.amount_paise,
  }));
  const hasMedicines=v.items.some(x=>x.medicine_id);
  const status = v.voided_at
    ? "VOIDED"
    : v.received_paise >= v.total_paise
      ? "PAID"
      : v.received_paise
        ? "PARTIALLY PAID"
        : "UNPAID";
  const whole = Math.floor(v.total_paise / 100),
    paise = v.total_paise % 100;
  const date = new Date(v.created_at).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  $("invoice-paper").innerHTML =
    `<div class="invoice-heading"><div><img class="invoice-logo" src="/logo.png" alt="Yogi Piles &amp; Panchkarma Center" width="80" height="80"><h2>YOGI PILES</h2><strong>& Panchkarma Center</strong><p>${esc(v.clinic_address || CLINIC_ADDRESSES[0].address)}<br>Contact: +91 9453272173, +91 5223649819</p></div><div class="invoice-right"><h2>${v.tax_rate_bps ? "TAX INVOICE" : "INVOICE"}</h2><span class="gst">GSTIN: 09AINPR4695R1ZU</span><p>${esc(v.invoice_number)}</p></div></div>${v.voided_at ? `<div class="void-banner">VOIDED · ${esc(v.void_reason)}</div>` : ""}<div class="patient-box"><div><span>Patient Name</span><b>${esc(v.patient_name)}</b><span>Age / Gender</span><b>${esc(v.age || "—")} Years / ${esc(v.gender || "—")}</b><span>Mode of Payment</span><b>${esc(v.payment_mode)}</b></div><div><span>Reg. No. / UID</span><b>${esc(v.registration || "—")}</b><span>Date & Time</span><b>${esc(date)}</b><span>Status</span><b class="status">${status}</b></div></div><table class="bill-table"><thead><tr><th>S.NO.</th><th>TYPE</th><th>MEDICINE / SERVICE NAME</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th>${hasMedicines?'<th>MEDICINE TOTAL</th>':''}</tr></thead><tbody>${v.items.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.type)}</td><td>${esc(x.description)}</td><td>${x.quantity}</td><td>${fmt(x.unit_price_paise)}</td><td>${fmt(x.amount_paise)}</td>${hasMedicines?`<td>${x.medicine_id?fmt(x.final_amount_paise):"?"}</td>`:""}</tr>`).join("")}</tbody></table><div class="bill-bottom"><div class="words"><strong>AMOUNT IN WORDS</strong><br>${words(whole) || "Zero"} Indian Rupees${paise ? " and " + words(paise) + " Paise" : ""} Only</div><div class="bill-totals"><div><span>Subtotal:</span><b>${fmt(v.subtotal_paise)}</b></div>${v.opd_visit_id ? `<div><span>Discount (${(v.discount_bps||0)/100}%):</span><b>${fmt(v.discount_paise||0)}</b></div>` : ""}${v.tax_rate_bps ? `<div><span>CGST${hasMedicines?"":` (${(v.tax_rate_bps / 100).toFixed(2)}%)`}:</span><b>${fmt(v.cgst_paise)}</b></div><div><span>SGST${hasMedicines?"":` (${(v.tax_rate_bps / 100).toFixed(2)}%)`}:</span><b>${fmt(v.sgst_paise)}</b></div>` : ""}<div class="final"><span>Grand Total:</span><b>${fmt(v.total_paise)}</b></div><div><span>Amount Received:</span><b>${fmt(v.received_paise)}</b></div><div><span>Balance Due:</span><b>${fmt(v.balance_paise)}</b></div></div></div>${v.payments.length ? `<div class="payment-history"><strong>PAYMENTS RECEIVED AFTER ISSUE</strong>${v.payments.map((p) => `<div>${esc(new Date(p.received_at).toLocaleDateString("en-IN"))} · ${esc(p.mode)} · ${fmt(p.amount_paise)} ${p.note ? "· " + esc(p.note) : ""}</div>`).join("")}</div>` : ""}${v.payment_adjustments?.length ? `<div class="payment-history"><strong>MANUAL PAYMENT STATUS ADJUSTMENTS</strong>${v.payment_adjustments.map(p => `<div>${esc(new Date(p.created_at).toLocaleString("en-IN"))} &middot; Marked ${esc(p.status)} &middot; Adjustment: ${fmt(p.amount_paise)}</div>`).join("")}</div>` : ""}<div class="signatures"><div>Patient / Attendant Signature</div><div>Authorized Signatory / Cashier</div></div><div class="bill-note">* This is a computerized invoice and does not require a physical signature. Thank you for choosing Yogi Piles & Panchkarma Center. Wishing you a speedy recovery.</div><div class="bill-footer"><span>Yogi Piles & Panchkarma Center · Computerized Invoice</span><span>Page 1 of 1</span></div>`;
  view("detail");
  if(v.opd_number) $('invoice-paper').querySelector('.invoice-right').insertAdjacentHTML('beforeend',`<p>OPD: ${esc(v.opd_number)}</p>`);
  window.scrollTo(0, 0);
}
api("/api/me")
  .then(() => {
    $("login").hidden = true;
    $("workspace").hidden = false;
    fillRegistration();
  })
  .catch(() => {});

initOpd({$,api,esc,fmt,view,showInvoice,words,prepareInvoice(visit) {
  resetInvoiceEditor(); linkedVisit=visit;
  const form=$('invoice-form');
  for (const [name,value] of Object.entries({patient_name:visit.patient_name,age:visit.age,gender:visit.gender,payment_mode:visit.payment_mode||'UNPAID'})) {
    form.elements[name].value=value; form.elements[name].disabled=true;
  }
  $('registration').value=visit.patient_uid;
  $('items').replaceChildren();
  itemRow(`Consultation - ${visit.doctor_name}`,visit.consultation_fee_paise/100,1,'Service');
  $('items').firstElementChild.classList.add('locked-charge');
  $('items').firstElementChild.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
  $('invoice-opd-notice').hidden=false;
  $('invoice-opd-notice').textContent=`${visit.opd_number} · ${visit.patient_uid} · Consultation from OPD. Save invoice to issue it. Additional charges can be added below.`;
  update(); view('editor'); window.scrollTo(0,0);
}});

initMedicines({api,view,esc,fmt});
