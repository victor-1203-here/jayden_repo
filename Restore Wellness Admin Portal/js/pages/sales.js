/* Page 15 · Sales — record every sale (all roles); Management confirms payment.
 * Reads: sales, customers, products, people, companies, settings. Writes: sales (+ customer prepaid on confirm).
 * Same columns as Sales Tracker > Daily Sales. After Management confirms, the Developer writes
 * Restore Wellness sales to the Google Sheet; Verdulife sales stay in the system only.
 * Scope: Management + Admin = all; Nutritionist = own customers; Agent = own sales.
 */
'use strict';

const SL = { month: new Date().toISOString().slice(0, 7), status: '', q: '', adding: false, f: null };
const slBlank = ctx => ({ date: new Date().toISOString().slice(0, 10), phone: '', product_id: '', upgrade: true, amount: '', method: ctx.data.settings.payment_methods[0], company: 'restore', agent_id: ctx.role === 'agent' ? ctx.user.id : '', receipt: '', remarks: '', valid_until: '' });

Pages.sales = ctx => {
  if (!SL.f) SL.f = slBlank(ctx);
  if (ctx.params[0] === 'pending') { SL.status = 'pending'; history.replaceState(null, '', '#/sales'); }
  const el = document.createElement('div');
  const draw = () => { el.innerHTML = slPage(ctx); };
  el.addEventListener('input', e => slInput(e, el, ctx, draw, false));
  el.addEventListener('change', e => slInput(e, el, ctx, draw, true));
  el.addEventListener('click', e => slClick(e, el, ctx, draw));
  draw();
  return el;
};

const slMonths = () => { const out = [], d = new Date(); d.setDate(1); for (let i = 0; i < 6; i++) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1); } return out; };

function slPage(ctx) {
  const D = ctx.data, mgmt = ctx.role === 'mgmt';
  const name = ph => D.customers.customers.find(c => c.phone === ph)?.name || fmtPhone(ph);
  const person = id => D.people.people.find(p => p.id === id)?.name || '—';
  const co = id => D.companies.companies.find(c => c.id === id);
  const q = SL.q.trim().toLowerCase();
  const rows = D.sales.sales
    .filter(s => s.date.startsWith(SL.month) || (SL.status === 'pending' && s.status !== 'confirmed'))
    .filter(s => !SL.status || (SL.status === 'pending' ? s.status !== 'confirmed' : s.status === 'confirmed'))
    .filter(s => !q || name(s.phone).toLowerCase().includes(q) || s.phone.includes(q.replace(/\D/g, '') || '§') || s.product.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  const inMonth = D.sales.sales.filter(s => s.date.startsWith(SL.month));
  const tot = st => inMonth.filter(s => st === 'confirmed' ? s.status === 'confirmed' : s.status !== 'confirmed').reduce((a, s) => a + s.amount_rm, 0);

  return `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
      <div><h1>Sales</h1><p>Record every payment received. ${mgmt ? 'Confirm a sale once the money is in: commission and the Google Sheet only count confirmed sales.' : 'Management confirms the payment; commission counts after that.'}</p></div>
      ${SL.adding ? '' : '<button class="btn primary" data-act="add">+ Record a sale</button>'}</div>
    ${SL.adding ? slForm(ctx) : ''}
    <div class="grid c3" style="margin-bottom:14px">
      <div class="card tile"><span class="muted">Confirmed · ${SL.month}</span><b class="big money">${rm0(tot('confirmed'))}</b></div>
      <div class="card tile"><span class="muted">Waiting for confirmation</span><b class="big money">${rm0(tot('pending'))}</b></div>
      <div class="card tile"><span class="muted">Sales recorded</span><b class="big">${inMonth.length}</b></div>
    </div>
    <div class="toolbar">
      <select class="in" data-k="month">${slMonths().map(m => `<option ${m === SL.month ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select class="in" data-k="status"><option value="">All</option><option value="pending" ${SL.status === 'pending' ? 'selected' : ''}>Waiting (all months)</option><option value="confirmed" ${SL.status === 'confirmed' ? 'selected' : ''}>Confirmed</option></select>
      <input class="in grow" type="search" data-k="q" placeholder="Search customer, phone or product" value="${esc(SL.q)}">
    </div>
    <div class="card" style="padding:0">${rows.length ? rows.map(s => {
      const c = co(s.company);
      return `<div class="pr-row">
        <div class="pr-main"><b>${esc(name(s.phone))}</b> <span class="muted mono" style="font-size:11.5px">${fmtPhone(s.phone)}</span>
          <div class="muted pr-sub">${s.date} · ${esc(s.product)}${s.upgrade_from ? ' <span class="chip">Upgrade</span>' : ''} · ${esc(s.payment_method || '')}${s.receipt ? ' · Ref ' + esc(s.receipt) : ''}
            · <span class="chip">${esc(c?.name || s.company)}</span>${s.agent_id ? ` · Agent ${esc(person(s.agent_id))}` : ''} · recorded by ${esc(person(s.recorded_by))}${s.remarks || s.note ? ' · ' + esc(s.remarks || s.note) : ''}</div></div>
        <div class="pr-price"><b class="money">${rm0(s.amount_rm)}</b>
          ${s.status === 'confirmed' ? `<span class="chip ok" title="Confirmed by ${esc(person(s.confirmed_by))} ${s.confirmed_date || ''}">Paid ✓</span>` : '<span class="chip warn">Waiting</span>'}
          ${c?.writes_to_sales_tracker ? '<span class="chip" title="Written to the Google Sheet after confirmation (Developer)">Sheet</span>' : ''}
          ${mgmt ? (s.status === 'confirmed' ? `<button class="link-btn" data-undo="${s.id}">Undo</button>` : `<button class="btn primary" data-confirm="${s.id}">Confirm paid</button>`) : ''}</div>
      </div>`;
    }).join('') : '<p class="muted" style="padding:16px">No sales.</p>'}</div>`;
}

function slForm(ctx) {
  const D = ctx.data, f = SL.f;
  const custs = [...D.customers.customers].sort((a, b) => a.name.localeCompare(b.name));
  const prods = D.products.products.filter(p => p.id !== 'p-smart-upgrade-to-clinical-top-up');
  const cats = [...new Set(prods.map(p => p.category))];
  const p = prods.find(x => x.id === f.product_id);
  const up = f.phone && f.product_id ? SalesAPI.upgradeOption(f.product_id, f.phone) : null;
  const pr = f.product_id ? SalesAPI.priceFor(f.product_id, f.phone, f.upgrade) : null;
  const chk = f.product_id && f.amount !== '' ? SalesAPI.check(f.product_id, +f.amount, f.phone, f.upgrade, ctx.role) : null;
  const cust = custs.find(c => c.phone === f.phone);
  const custAgent = cust?.agent_id ? D.people.people.find(x => x.id === cust.agent_id)?.name : null;
  const agents = D.people.people.filter(x => x.role === 'agent' && x.active);
  return `<div class="card" style="margin-bottom:14px"><h3>Record a sale</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:10px">
      <label class="field">Date *<input class="in" type="date" data-k="f" data-f="date" value="${f.date}"></label>
      <label class="field">Customer *<select class="in" data-k="f" data-f="phone"><option value="">Choose…</option>${custs.map(c => `<option value="${c.phone}" ${c.phone === f.phone ? 'selected' : ''}>${esc(c.name)} · ${fmtPhone(c.phone)}</option>`).join('')}</select>
        <a href="#/customers" class="muted" style="font-size:11.5px">Not in the list? Add the customer first</a></label>
      <label class="field" style="grid-column:span 2">Product / package *<select class="in" data-k="f" data-f="product_id"><option value="">Choose…</option>
        ${cats.map(c => `<optgroup label="${esc(c)}">${prods.filter(x => x.category === c).map(x => { const r = Pricing.product(D, x); return `<option value="${x.id}" ${x.id === f.product_id ? 'selected' : ''}>${esc(x.name)}${r.price != null ? ' · ' + rm0(r.price) : ''}</option>`; }).join('')}</optgroup>`).join('')}</select></label>
      ${up ? `<label style="grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:13px;background:var(--accent-soft);padding:8px 10px;border-radius:8px">
        <input type="checkbox" data-k="f" data-f="upgrade" ${f.upgrade ? 'checked' : ''}> Upgrade from ${up.fromCode} bought on ${up.fromDate}: customer pays ${rm0(up.toPay)} (${rm0(up.credit)} already paid is credited, ${up.daysLeft} day${up.daysLeft === 1 ? '' : 's'} left)</label>` : ''}
      <label class="field">Amount received (RM) *<input class="in" type="number" step="0.01" data-k="f" data-f="amount" value="${f.amount}" placeholder="${pr?.list ?? ''}">
        ${pr ? `<span class="muted" style="font-size:11.5px">List price ${pr.list != null ? rm(pr.list) : 'per quotation'}</span>` : ''}</label>
      <label class="field">Payment method<select class="in" data-k="f" data-f="method">${D.settings.payment_methods.map(m => `<option ${m === f.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <label class="field">Company<select class="in" data-k="f" data-f="company">${D.companies.companies.map(c => `<option value="${c.id}" ${c.id === f.company ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field">Sold by agent${ctx.role === 'agent' ? `<input class="in" value="${esc(ctx.user.name)} (you)" disabled>` : `<select class="in" data-k="f" data-f="agent_id"><option value="">No — staff sale</option>${agents.map(a => `<option value="${a.id}" ${a.id === f.agent_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`}
        ${custAgent ? `<span class="muted" style="font-size:11.5px">Customer's agent: ${esc(custAgent)} (commission follows the customer)</span>` : ''}</label>
      <label class="field">Receipt / ref no.<input class="in" data-k="f" data-f="receipt" value="${esc(f.receipt)}"></label>
      ${p?.prepaid ? `<label class="field">Valid until *<input class="in" type="date" data-k="f" data-f="valid_until" value="${f.valid_until}"></label>` : ''}
      <label class="field" style="grid-column:1/-1">Remarks<input class="in" data-k="f" data-f="remarks" value="${esc(f.remarks)}"></label>
    </div>
    <div id="slCheck" style="margin-top:10px">${slCheckHtml(chk)}</div>
    <div class="toolbar" style="margin:12px 0 0"><button class="btn primary" data-act="save" ${chk && !chk.ok ? 'disabled' : ''}>Save sale</button><button class="btn" data-act="cancel">Cancel</button>
      <span class="muted" style="font-size:12px">Saved as “Waiting” until Management confirms the payment.</span></div>
  </div>`;
}
function slCheckHtml(chk) {
  if (!chk) return '';
  if (!chk.ok) return `<div class="notice danger">${esc(chk.reason)}</div>`;
  const bits = [];
  if (chk.discount) bits.push(`Discount OK${chk.margin != null ? ` · margin ${(chk.margin * 100).toFixed(0)}%` : ''}`);
  if (chk.warn) bits.push(chk.warn);
  return bits.length ? `<div class="notice">${esc(bits.join(' · '))}</div>` : '';
}

function slInput(e, el, ctx, draw, isChange) {
  const t = e.target, k = t.dataset.k;
  if (!k) return;
  if (k === 'q' && !isChange) { SL.q = t.value; const pos = t.selectionStart; draw(); const s = el.querySelector('[data-k="q"]'); s.focus(); s.setSelectionRange(pos, pos); return; }
  if (k === 'month' && isChange) { SL.month = t.value; draw(); return; }
  if (k === 'status' && isChange) { SL.status = t.value; draw(); return; }
  if (k !== 'f') return;
  const f = SL.f, name = t.dataset.f;
  f[name] = t.type === 'checkbox' ? t.checked : t.value;
  if (name === 'amount' && !isChange) {           // live check without redrawing the form
    const chk = f.product_id && f.amount !== '' ? SalesAPI.check(f.product_id, +f.amount, f.phone, f.upgrade, ctx.role) : null;
    el.querySelector('#slCheck').innerHTML = slCheckHtml(chk);
    el.querySelector('[data-act="save"]').disabled = !!(chk && !chk.ok);
    return;
  }
  if (!isChange) return;
  if (['product_id', 'phone', 'upgrade'].includes(name) && f.product_id) {
    const pr = SalesAPI.priceFor(f.product_id, f.phone, f.upgrade);
    f.amount = pr.list != null ? String(pr.list) : '';
  }
  draw();
}

async function slClick(e, el, ctx, draw) {
  const conf = e.target.closest('[data-confirm]'), undo = e.target.closest('[data-undo]');
  if (conf || undo) {
    if (ctx.role !== 'mgmt') return;
    const s = Data.raw.sales.sales.find(x => x.id === (conf || undo).dataset[conf ? 'confirm' : 'undo']);
    if (undo && !confirm('Undo the payment confirmation? Commission for this sale goes back to waiting.')) return;
    try { await SalesAPI.save(conf ? 'confirm' : 'unconfirm', { id: s.id }, ctx.user.id); toast(conf ? 'Payment confirmed' : 'Confirmation undone'); App.route(); }
    catch (err) { toast(err.message); }
    return;
  }
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'add') { SL.adding = true; SL.f = slBlank(ctx); draw(); return; }
  if (a === 'cancel') { SL.adding = false; draw(); return; }
  if (a !== 'save') return;
  const f = SL.f, D = Data.raw, p = D.products.products.find(x => x.id === f.product_id);
  if (!f.phone) return toast('Choose the customer');
  if (!p) return toast('Choose the product');
  const chk = SalesAPI.check(f.product_id, +f.amount, f.phone, f.upgrade, ctx.role);
  if (!chk.ok) return toast(chk.reason);
  if (p.prepaid && !f.valid_until) return toast('Enter Valid Until for a prepaid package');
  const up = f.upgrade ? SalesAPI.upgradeOption(f.product_id, f.phone) : null;
  const upProd = up && D.products.products.find(x => x.id === 'p-smart-upgrade-to-clinical-top-up');
  const sale = {
    id: 's-' + Date.now().toString(36), date: f.date, phone: f.phone,
    package_code: p.source?.type === 'package' ? p.source.code : null,
    product: upProd ? upProd.name : p.name, product_id: upProd ? upProd.id : p.id, category: p.category, prepaid: !!p.prepaid,
    amount_rm: +f.amount, list_price_rm: chk.listPrice ?? null, payment_method: f.method,
    agent_id: ctx.role === 'agent' ? ctx.user.id : f.agent_id || null, recorded_by: ctx.user.id, company: f.company,
    receipt: f.receipt.trim() || null, remarks: f.remarks.trim(), valid_until: p.prepaid ? f.valid_until : null,
    ...(up ? { upgrade_from: up.from } : {}), created: new Date().toISOString(),
  };
  try { await SalesAPI.save('create', sale, ctx.user.id); SL.adding = false; toast('Sale saved — waiting for Management to confirm'); App.route(); }
  catch (err) { toast(err.message); }
}
