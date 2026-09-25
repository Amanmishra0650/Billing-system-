const $ = (id) => document.getElementById(id);
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
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}
function view(name) {
  for (const n of ["editor", "history", "detail"]) $(n).hidden = n !== name;
  $("new-tab").classList.toggle("active", name === "editor");
  $("history-tab").classList.toggle("active", name !== "editor");
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
    update();
  };
  row.addEventListener("input", update);
  row.addEventListener("change", update);
  $("items").append(row);
  update();
}
function update() {
  let subtotal = 0;
  document.querySelectorAll(".item-row").forEach((row) => {
    const amount =
      rupees(row.querySelector(".unit-price").value) *
      (Number(row.querySelector(".quantity").value) || 0);
    row.querySelector(".line-total strong").textContent = fmt(amount);
    subtotal += amount;
  });
  const rate = Number($("tax-rate").value) || 0;
  const tax = Math.round((subtotal * rate) / 100);
  const total = subtotal + tax * 2;
  for (const [id, value] of Object.entries({
    subtotal,
    cgst: tax,
    sgst: tax,
    total,
    balance: Math.max(0, total - rupees($("paid").value)),
  }))
    $(id).textContent = fmt(value);
}
$("add-item").onclick = () => itemRow();
$("tax-rate").oninput = update;
$("paid").oninput = update;
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
  } catch (err) {
    $("login-error").textContent = err.message;
  }
};
$("logout").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  $("workspace").hidden = true;
  $("login").hidden = false;
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
  }));
  const payload = {
    patient_name: fd.get("patient_name"),
    registration: fd.get("registration"),
    age: fd.get("age"),
    gender: fd.get("gender"),
    payment_mode: fd.get("payment_mode"),
    tax_rate_bps: Math.round(Number(fd.get("tax_rate")) * 100),
    paid_paise: rupees(fd.get("paid")),
    items,
  };
  try {
    const saved = await api("/api/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    e.target.reset();
    $("items").replaceChildren();
    itemRow();
    update();
    showInvoice(saved);
  } catch (err) {
    $("form-message").textContent = err.message;
  }
};
async function list() {
  try {
    const records = await api(
      "/api/invoices?q=" + encodeURIComponent($("search").value),
    );
    $("rows").innerHTML = records
      .map(
        (r) =>
          `<tr><td><strong>${esc(r.invoice_number)}</strong></td><td>${esc(r.patient_name)}<small>${esc(r.registration)}</small></td><td>${new Date(r.created_at).toLocaleDateString("en-IN")}</td><td>${fmt(r.total_paise)}</td><td><span class="pill">${r.voided_at ? "Voided" : r.received_paise >= r.total_paise ? "Paid" : r.received_paise ? "Partial" : "Unpaid"}</span></td><td><button class="open" data-id="${r.id}">Open →</button></td></tr>`,
      )
      .join("");
    $("history-empty").hidden = !!records.length;
    document
      .querySelectorAll(".open")
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
$("new-tab").onclick = () => view("editor");
$("create-from-history").onclick = () => view("editor");
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
let currentInvoice = null;
$("payment-form").onsubmit = async (e) => {
  e.preventDefault();
  $("detail-error").textContent = "";
  const fd = new FormData(e.target);
  try {
    const v = await api(`/api/invoices/${currentInvoice.id}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount_paise: rupees(fd.get("amount")),
        mode: fd.get("mode"),
        note: fd.get("note"),
      }),
    });
    e.target.reset();
    showInvoice(v);
  } catch (err) {
    $("detail-error").textContent = err.message;
  }
};
$("void-button").onclick = async () => {
  const reason = prompt(
    "Reason for voiding this unpaid invoice (at least 5 characters):",
  );
  if (reason === null) return;
  if (!confirm("Void this invoice? Its number will remain in the history."))
    return;
  try {
    showInvoice(
      await api(`/api/invoices/${currentInvoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    );
  } catch (err) {
    $("detail-error").textContent = err.message;
  }
};
function showInvoice(v) {
  v.items = v.items.map((x) => ({
    type: x.type || "Treatment",
    description: x.description,
    quantity: x.quantity || 1,
    unit_price_paise: x.unit_price_paise ?? x.amount_paise,
    amount_paise: x.amount_paise,
  }));
  currentInvoice = v;
  $("detail-error").textContent = "";
  $("invoice-controls").hidden = !!v.voided_at;
  $("payment-form").hidden = v.balance_paise <= 0;
  $("void-button").hidden = v.received_paise > 0;
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
    `<div class="invoice-heading"><div><h2>YOGI PILES</h2><strong>& Panchkarma Center</strong><p>Munshipuliya, Lucknow, Uttar Pradesh<br>Contact: +91 9453272173, +91 5223649819</p></div><div class="invoice-right"><h2>TAX INVOICE</h2><span class="gst">GSTIN: 09AINPR4695R1ZU</span><p>${esc(v.invoice_number)}</p></div></div>${v.voided_at ? `<div class="void-banner">VOIDED · ${esc(v.void_reason)}</div>` : ""}<div class="patient-box"><div><span>Patient Name</span><b>${esc(v.patient_name)}</b><span>Age / Gender</span><b>${esc(v.age || "—")} Years / ${esc(v.gender || "—")}</b><span>Mode of Payment</span><b>${esc(v.payment_mode)}</b></div><div><span>Reg. No. / UID</span><b>${esc(v.registration || "—")}</b><span>Date & Time</span><b>${esc(date)}</b><span>Status</span><b class="status">${status}</b></div></div><table class="bill-table"><thead><tr><th>S.NO.</th><th>TYPE</th><th>MEDICINE / SERVICE NAME</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody>${v.items.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.type)}</td><td>${esc(x.description)}</td><td>${x.quantity}</td><td>${fmt(x.unit_price_paise)}</td><td>${fmt(x.amount_paise)}</td></tr>`).join("")}</tbody></table><div class="bill-bottom"><div class="words"><strong>AMOUNT IN WORDS</strong><br>${words(whole) || "Zero"} Indian Rupees${paise ? " and " + words(paise) + " Paise" : ""} Only</div><div class="bill-totals"><div><span>Subtotal:</span><b>${fmt(v.subtotal_paise)}</b></div><div><span>CGST (${(v.tax_rate_bps / 100).toFixed(2)}%):</span><b>${fmt(v.cgst_paise)}</b></div><div><span>SGST (${(v.tax_rate_bps / 100).toFixed(2)}%):</span><b>${fmt(v.sgst_paise)}</b></div><div class="final"><span>Grand Total:</span><b>${fmt(v.total_paise)}</b></div><div><span>Amount Received:</span><b>${fmt(v.received_paise)}</b></div><div><span>Balance Due:</span><b>${fmt(v.balance_paise)}</b></div></div></div>${v.payments.length ? `<div class="payment-history"><strong>PAYMENTS RECEIVED AFTER ISSUE</strong>${v.payments.map((p) => `<div>${esc(new Date(p.received_at).toLocaleDateString("en-IN"))} · ${esc(p.mode)} · ${fmt(p.amount_paise)} ${p.note ? "· " + esc(p.note) : ""}</div>`).join("")}</div>` : ""}<div class="signatures"><div>Patient / Attendant Signature</div><div>Authorized Signatory / Cashier</div></div><div class="bill-note">* This is a computerized tax invoice and does not require a physical signature. Thank you for choosing Yogi Piles & Panchkarma Center. Wishing you a speedy recovery.</div><div class="bill-footer"><span>Yogi Piles & Panchkarma Center · Computerized Tax Invoice</span><span>Page 1 of 1</span></div>`;
  view("detail");
  window.scrollTo(0, 0);
}
api("/api/me")
  .then(() => {
    $("login").hidden = true;
    $("workspace").hidden = false;
  })
  .catch(() => {});
