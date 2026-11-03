/* Page 12 · Price & Cost Settings (Management only).
 * Reads + writes: products.json, cost_calc_data.json, restore_packages.json, app_settings.json
 * Every column with cost / margin / budget is Management data (data-role="mgmt").
 * SERVER: reject this page's data and the save calls for every role except Management.
 */
'use strict';

const PS = { W: null, dirty: new Set(), tab: 'products', q: '', cat: '', labQ: '', leader: false, imp: null };
const FILE_LABEL = { products: 'Products', costCalc: 'Lab tests / Cost Calculator', packages: 'Packages & treatment items', settings: 'Settings' };

function psInit() {
  PS.W = {
    products: clone(Data.raw.products), costCalc: clone(Data.raw.costCalc),
    packages: clone(Data.raw.packages), settings: clone(Data.raw.settings),
  };
  PS.dirty.clear();
}
const psDirty = k => { if (k) PS.dirty.add(k); };
const today = () => new Date().toISOString().slice(0, 10);
const money = v => v == null ? '<span class="muted">—</span>' : `<span class="money">${rm(v)}</span>`;
const pctTxt = v => v == null ? '<span class="muted">—</span>' : `<span class="${v < PS.W.settings.discount_margin_floor ? 'pct-low' : 'pct-good'}">${(v * 100).toFixed(0)}%</span>`;
const numIn = (v, attrs, cls = '') => `<input class="in num ${cls}" type="number" step="0.01" value="${v ?? ''}" ${attrs}>`;
const parseNum = s => { if (String(s).trim() === '') return null; const x = Number(s); return isFinite(x) ? x : null; };

window.addEventListener('beforeunload', e => { if (PS.dirty.size) { e.preventDefault(); e.returnValue = ''; } });

Pages.pricing = ctx => {
  if (ctx.role !== 'mgmt') return '<div class="card">Management only.</div>';
  if (!PS.W) psInit();
  const el = document.createElement('div');
  el.addEventListener('click', e => psClick(e, el));
  el.addEventListener('change', e => psChange(e, el));
  el.addEventListener('input', e => { if (e.target.dataset.k === 'search') { PS[e.target.dataset.f] = e.target.value; psRenderBody(el); } });
  psRender(el);
  return el;
};

function psRender(el) {
  const tabs = [['products', 'Products'], ['lab', 'Lab tests'], ['packages', 'Packages'], ['markers', 'Blood markers'], ['rules', 'Cost assumptions & rules'], ['excel', 'Import / export']];
  el.innerHTML = `
    <div class="page-head"><h1>Price & Cost Settings</h1>
      <p>Management only. Selling price default = cost / 0.4 (you can override). Margins under ${(PS.W.settings.discount_margin_floor * 100).toFixed(0)}% are shown in red.</p></div>
    <div class="tabs">${tabs.map(([id, t]) => `<button data-tab="${id}" class="${PS.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="psBody"></div>
    <div id="psSave"></div>`;
  psRenderBody(el);
}

function psRenderBody(el) {
  const body = el.querySelector('#psBody');
  const active = document.activeElement?.dataset?.k === 'search' ? document.activeElement.dataset.f : null;
  body.innerHTML = ({ products: psProducts, lab: psLab, packages: psPackages, markers: psMarkers, rules: psRules, excel: psExcel })[PS.tab]();
  if (active) { const s = body.querySelector(`[data-k="search"][data-f="${active}"]`); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
  el.querySelector('#psSave').innerHTML = PS.dirty.size ? `
    <div class="savebar"><span class="grow">Unsaved changes: ${[...PS.dirty].map(k => FILE_LABEL[k]).join(', ')}</span>
      <button class="btn" data-act="discard">Discard</button><button class="btn primary" data-act="save">Save changes</button></div>` : '';
}

/* ---------------- tab: products ---------------- */
function psProducts() {
  const W = PS.W, q = PS.q.toLowerCase();
  const cats = [...new Set(W.products.products.map(p => p.category))];
  const rows = W.products.products.filter(p => (!PS.cat || p.category === PS.cat) && (!q || p.name.toLowerCase().includes(q)));
  return `
    <div class="toolbar">
      <input class="in grow" placeholder="Search products" data-k="search" data-f="q" value="${esc(PS.q)}">
      <select class="in" data-k="cat"><option value="">All categories</option>${cats.map(c => `<option ${c === PS.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="card table-wrap" style="padding:6px 8px">
    <table class="t">
      <tr><th>Product</th><th>Category</th><th class="r">Price</th><th class="r" data-role="mgmt">Cost</th><th class="r" data-role="mgmt">Cost / 0.4</th><th class="r" data-role="mgmt">Margin</th><th class="c">Discount</th><th class="c">Prepaid</th><th></th></tr>
      ${rows.map(p => {
        const r = Pricing.product(W, p), sug = Pricing.suggested(r.cost);
        return `<tr>
          <td>${p.source ? esc(p.name) : `<input class="in" style="width:100%;min-width:180px" value="${esc(p.name)}" data-k="prod-name" data-id="${p.id}">`}
            <div class="muted" style="font-size:11.5px">${r.from ? `Linked: ${r.from} <span class="mono">${esc(p.source.code)}</span>` : 'Own price'}${p.remarks ? ' · ' + esc(p.remarks) : ''}</div></td>
          <td>${esc(p.category)}</td>
          <td class="r">${r.editPrice ? numIn(r.price, `data-k="prod-price" data-id="${p.id}"`) : money(r.price)}</td>
          <td class="r" data-role="mgmt">${r.editCost ? numIn(r.cost, `data-k="prod-cost" data-id="${p.id}"`) : r.costNote ? `<span class="muted" style="font-size:12px">${r.costNote}</span>` : money(r.cost)}</td>
          <td class="r" data-role="mgmt">${sug && r.editPrice && sug !== r.price ? `<button class="link-btn" data-act="prod-use" data-id="${p.id}" title="Use as price">${rm0(sug)} ↵</button>` : sug ? `<span class="money muted">${rm0(sug)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="r" data-role="mgmt">${pctTxt(Pricing.margin(r.price, r.cost))}</td>
          <td class="c"><input type="checkbox" ${p.discount_allowed ? 'checked' : ''} data-k="prod-flag" data-f="discount_allowed" data-id="${p.id}"></td>
          <td class="c"><input type="checkbox" ${p.prepaid ? 'checked' : ''} data-k="prod-flag" data-f="prepaid" data-id="${p.id}"></td>
          <td>${p.source ? '' : `<button class="x-btn" title="Remove" data-act="prod-del" data-id="${p.id}">✕</button>`}</td></tr>`;
      }).join('')}
      <tr class="sub"><td><input class="in" style="width:100%" placeholder="New product name" id="npName"></td>
        <td><select class="in" id="npCat">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></td>
        <td class="r">${numIn('', 'id="npPrice"')}</td><td class="r" data-role="mgmt">${numIn('', 'id="npCost"')}</td><td colspan="2"></td>
        <td class="c"><input type="checkbox" id="npDisc" checked></td><td class="c"><input type="checkbox" id="npPre"></td>
        <td><button class="btn primary" data-act="prod-add">Add</button></td></tr>
    </table></div>
    <p class="muted" style="font-size:12.5px">Linked rows edit the source file, so the price changes everywhere (planner, price lookup). Blood marker cost comes from the lab tests; package cost is on the Packages tab.</p>`;
}

/* ---------------- tab: lab tests ---------------- */
function psLab() {
  const tests = PS.W.costCalc.master_tests, q = PS.labQ.toLowerCase();
  return `
    <div class="toolbar"><input class="in grow" placeholder="Search lab tests" data-k="search" data-f="labQ" value="${esc(PS.labQ)}">
      <span class="muted" style="font-size:12.5px">${tests.length} tests · cost for pricing = the higher of the two labs</span></div>
    <div class="card table-wrap" style="padding:6px 8px"><table class="t">
      <tr><th>Test</th><th>Eurofins code</th><th class="r" data-role="mgmt">Eurofins cost</th><th>Innoquest code</th><th class="r" data-role="mgmt">Innoquest cost</th>
        <th class="r" data-role="mgmt">Higher cost</th><th class="r">Selling</th><th class="r" data-role="mgmt">Cost / 0.4</th><th class="r" data-role="mgmt">Margin</th><th class="c">Discount</th></tr>
      ${tests.map((t, i) => {
        if (q && !t.name.toLowerCase().includes(q)) return '';
        const hi = Pricing.labCostHigh(t), sug = Pricing.suggested(hi);
        return `<tr><td style="min-width:200px">${esc(t.name)}</td>
          <td><input class="in" style="width:96px" value="${esc(t.eurofins_code ?? '')}" data-k="lab-f" data-f="eurofins_code" data-i="${i}"></td>
          <td class="r" data-role="mgmt">${numIn(t.eurofins_cost, `data-k="lab-f" data-f="eurofins_cost" data-i="${i}"`, 'sm')}</td>
          <td><input class="in" style="width:80px" value="${esc(t.innoquest_code ?? '')}" data-k="lab-f" data-f="innoquest_code" data-i="${i}"></td>
          <td class="r" data-role="mgmt">${numIn(t.innoquest_cost, `data-k="lab-f" data-f="innoquest_cost" data-i="${i}"`, 'sm')}</td>
          <td class="r" data-role="mgmt">${money(hi)}</td>
          <td class="r">${numIn(t.selling, `data-k="lab-f" data-f="selling" data-i="${i}"`, 'sm')}</td>
          <td class="r" data-role="mgmt">${sug && sug !== t.selling ? `<button class="link-btn" data-act="lab-use" data-i="${i}">${rm0(sug)} ↵</button>` : '<span class="muted">—</span>'}</td>
          <td class="r" data-role="mgmt">${pctTxt(Pricing.margin(t.selling, hi))}</td>
          <td class="c"><input type="checkbox" ${t.discount_allowed !== false ? 'checked' : ''} data-k="lab-flag" data-i="${i}"></td></tr>`;
      }).join('')}
      <tr class="sub"><td><input class="in" style="width:100%" placeholder="New test name" id="nlName"></td>
        <td><input class="in" style="width:96px" id="nlEc"></td><td class="r" data-role="mgmt">${numIn('', 'id="nlE"', 'sm')}</td>
        <td><input class="in" style="width:80px" id="nlIc"></td><td class="r" data-role="mgmt">${numIn('', 'id="nlI"', 'sm')}</td><td></td>
        <td class="r">${numIn('', 'id="nlSell"', 'sm')}</td><td colspan="2"></td><td><button class="btn primary" data-act="lab-add">Add</button></td></tr>
    </table></div>`;
}

/* ---------------- tab: packages ---------------- */
function psPackages() {
  const W = PS.W;
  return `
    <div class="toolbar"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-k="leader" ${PS.leader ? 'checked' : ''}> Calculate with leader override (${(W.packages.commission_rules.leader_override.rate * 100).toFixed(0)}% of net)</label></div>
    ${W.packages.packages.map(psPackageCard).join('')}`;
}

function psPackageCard(pk) {
  const W = PS.W, clin = pk.line === 'CLINICAL';
  const E = Pricing.packageEcon(W, pk, PS.leader);
  const markers = pk.default_blood_markers || [];
  const items = W.packages.items;
  const nameOf = c => Pricing.item(W, c)?.name_en || c;
  // rows: union of included + default plan
  const codes = [...new Set([...(pk.included_items || []).map(r => r.item), ...(pk.default_plan || []).map(r => r.item)])];
  const inc = c => (pk.included_items || []).find(r => r.item === c);
  const def = c => (pk.default_plan || []).find(r => r.item === c);
  let rowsHtml = '', locked = { cost: 0, value: 0 };
  for (const c of codes) {
    const u = Pricing.itemUnit(W, c, markers), minQ = clin ? inc(c)?.min_qty ?? 0 : null, q = clin ? def(c)?.qty ?? 0 : inc(c)?.qty ?? 0;
    if (clin) { locked.cost += (u.cost || 0) * minQ; locked.value += (u.price || 0) * minQ; }
    const bad = false;
    rowsHtml += `<tr><td>${esc(nameOf(c))}${c === 'blood_test' ? '<div class="muted" style="font-size:11.5px">Price / cost from the default markers below</div>' : ''}</td>
      <td class="r">${money(u.price)}</td><td class="r" data-role="mgmt">${money(u.cost)}</td>
      ${clin ? `<td class="r">${numIn(minQ, `data-k="pkg-qty" data-code="${pk.code}" data-list="included_items" data-item="${c}"`, 'sm')}</td>` : ''}
      <td class="r">${numIn(q, `data-k="pkg-qty" data-code="${pk.code}" data-list="${clin ? 'default_plan' : 'included_items'}" data-item="${c}"`, `sm ${bad ? 'pct-low' : ''}`)}</td>
      <td class="r">${money((u.price || 0) * q)}</td><td class="r" data-role="mgmt">${money(u.cost == null ? null : u.cost * q)}</td>
      <td><button class="x-btn" title="Remove" data-act="pkg-row-del" data-code="${pk.code}" data-item="${c}">✕</button></td></tr>`;
  }
  const plan = Pricing.planTotals(W, clin ? pk.default_plan : pk.included_items, markers);
  const addOpts = items.filter(i => !codes.includes(i.code)).map(i => `<option value="${i.code}">${esc(i.name_en)}</option>`).join('');
  const usedPct = clin && E.budget > 0 ? plan.cost / E.budget : null;
  const profit = E.available - (plan.cost || 0);

  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3>${esc(pk.name_en)}</h3><div class="muted" style="font-size:12.5px">${esc(pk.name_zh)} · <span class="mono">${pk.code}</span></div></div><span class="chip ${clin ? 'mgmt' : 'ok'}">${pk.line}</span></div>
    <div class="pkg-head">
      <label class="field">Price incl. SST (RM)${numIn(pk.price_incl_sst, `data-k="pkg-f" data-code="${pk.code}" data-f="price_incl_sst"`)}</label>
      <label class="field">Agent commission (RM)${numIn(pk.agent_commission_rm, `data-k="pkg-f" data-code="${pk.code}" data-f="agent_commission_rm"`)}</label>
      <label class="field">Duration (days)${numIn(pk.duration_days, `data-k="pkg-f" data-code="${pk.code}" data-f="duration_days"`, 'sm')}</label>
      ${clin ? `<label class="field">Lock %${numIn(+(pk.lock_pct * 100).toFixed(2), `data-k="pkg-f" data-code="${pk.code}" data-f="lock_pct" data-pct="1"`, 'sm')}</label>
      <label class="field">Value multiple${numIn(pk.value_multiple, `data-k="pkg-f" data-code="${pk.code}" data-f="value_multiple"`, 'sm')}</label>` : ''}
    </div>
    <div data-role="mgmt" style="padding:10px 14px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
      <div class="mgmt-label">Management only</div>
      <div class="stat-grid">
        <div class="stat"><span>Net (/ ${1 + W.packages.sst_rate})</span><b>${rm(E.net)}</b></div>
        <div class="stat"><span>Agent commission</span><b>−${rm(E.commission)}</b></div>
        ${PS.leader ? `<div class="stat"><span>Leader override</span><b>−${rm(E.override)}</b></div>` : ''}
        <div class="stat"><span>Payment fee (${(W.packages.payment_fee_rate_default * 100).toFixed(1)}%)</span><b>−${rm(E.fee)}</b></div>
        <div class="stat"><span>Available</span><b>${rm(E.available)}</b></div>
        ${clin ? `
        <div class="stat"><span>Lock (${(pk.lock_pct * 100).toFixed(0)}%)</span><b>${rm(E.lock)}</b></div>
        <div class="stat"><span>Treatment budget</span><b>${rm(E.budget)}</b></div>
        <div class="stat"><span>Poster items cost</span><b>${rm(locked.cost)} · ${(locked.cost / E.budget * 100).toFixed(0)}%</b></div>
        <div class="stat"><span>Default plan cost</span><b class="${usedPct > 1 ? 'pct-low' : ''}">${rm(plan.cost)} · ${(usedPct * 100).toFixed(0)}%</b></div>
        <div class="stat"><span>Plan value / target</span><b class="${plan.value < E.valueTarget ? 'pct-low' : ''}">${rm0(plan.value)} / ${rm0(E.valueTarget)}</b></div>`
        : `<div class="stat"><span>Delivery cost</span><b>${rm(plan.cost)}</b></div><div class="stat"><span>Value of items</span><b>${rm0(plan.value)}</b></div>`}
        <div class="stat"><span>Profit</span><b>${rm(profit)} · ${(profit / E.net * 100).toFixed(0)}% of net</b></div>
      </div>
      ${clin ? `<div class="bar" title="Default plan cost vs treatment budget"><i class="${usedPct > 1 ? 'over' : ''}" style="width:${Math.min(100, usedPct * 100)}%"></i></div>` : ''}
    </div>
    <div>
      <div class="table-wrap"><table class="t">
        <tr><th>Item</th><th class="r">Unit price</th><th class="r" data-role="mgmt">Unit cost</th>${clin ? '<th class="r">Poster qty</th><th class="r">Default qty</th>' : '<th class="r">Qty</th>'}<th class="r">Value</th><th class="r" data-role="mgmt">Cost</th><th></th></tr>
        ${rowsHtml}
        <tr class="sub"><td colspan="${clin ? 8 : 7}"><select class="in" data-k="pkg-row-add" data-code="${pk.code}"><option value="">+ Add item…</option>${addOpts}</select></td></tr>
      </table>
      ${clin ? `<div style="margin-top:10px;font-size:12.5px"><b>Default blood markers</b> (click to toggle) <span class="muted">· one test = ${rm0(Pricing.bloodUnit(W, markers).price)}</span>
        <div class="chips" style="margin-top:6px">${W.packages.blood_markers.map(m => `<button class="chip ${m.required || markers.includes(m.code) ? 'ok' : ''}" data-act="pkg-marker" data-code="${pk.code}" data-m="${m.code}" ${m.required ? 'disabled title="Always included"' : ''}>${esc(m.name_en)}</button>`).join('')}</div>
        <div style="margin-top:10px"><b>Optional add-ons the nutritionist can pick</b>
        <div class="chips" style="margin-top:6px">${(pk.optional_pool || []).map(c => `<span class="chip">${esc(nameOf(c))}<button class="x-btn" data-act="pool-del" data-code="${pk.code}" data-item="${c}">✕</button></span>`).join('')}
          <select class="in" data-k="pool-add" data-code="${pk.code}"><option value="">+ Add…</option>${items.filter(i => !(pk.optional_pool || []).includes(i.code) && i.code !== 'blood_test').map(i => `<option value="${i.code}">${esc(i.name_en)}</option>`).join('')}</select></div></div></div>` : ''}
      </div>
    </div></div>`;
}

/* ---------------- tab: blood markers ---------------- */
function psMarkers() {
  const W = PS.W, P = W.packages;
  const tests = W.costCalc.master_tests;
  return `
    <div class="toolbar"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Suggested cap per blood test (selling, RM) ${numIn(P.blood_marker_cap_per_test, 'data-k="set" data-path="packages.blood_marker_cap_per_test"')}</label></div>
    <div class="card table-wrap" style="padding:6px 8px"><table class="t">
      <tr><th>Marker group</th><th>Shown to customer as</th><th>Lab tests (cost source)</th><th class="r">Price</th><th class="r" data-role="mgmt">Cost</th><th class="r" data-role="mgmt">Margin</th><th class="c">Always</th></tr>
      ${P.blood_markers.map(m => {
        const cost = Pricing.markerCost(W, m);
        return `<tr><td><b>${esc(m.name_en)}</b><div class="muted" style="font-size:11.5px">${esc(m.name_zh)} · <span class="mono">${m.code}</span></div></td>
          <td><input class="in" style="width:100%;min-width:160px" value="${esc(m.includes)}" data-k="mk-includes" data-code="${m.code}"></td>
          <td><div class="chips">${(m.lab_tests || []).map(n => `<span class="chip">${esc(n)}<span class="money" data-role="mgmt" style="margin-left:4px;outline:0">${rm0(Pricing.labCostHigh(Pricing.labTest(W, n)) ?? 0)}</span><button class="x-btn" data-act="mk-del" data-code="${m.code}" data-n="${esc(n)}">✕</button></span>`).join('')}
            <select class="in" data-k="mk-add" data-code="${m.code}" style="max-width:150px"><option value="">+ Add test…</option>${tests.filter(t => !(m.lab_tests || []).includes(t.name)).map(t => `<option>${esc(t.name)}</option>`).join('')}</select></div></td>
          <td class="r">${numIn(m.price, `data-k="mk-price" data-code="${m.code}"`, 'sm')}</td>
          <td class="r" data-role="mgmt">${money(cost)}</td><td class="r" data-role="mgmt">${pctTxt(Pricing.margin(m.price, cost))}</td>
          <td class="c"><input type="checkbox" ${m.required ? 'checked' : ''} data-k="mk-req" data-code="${m.code}"></td></tr>`;
      }).join('')}
    </table></div>
    <p class="muted" style="font-size:12.5px">Cost of each group = its lab tests, each at the higher of the Eurofins and Innoquest cost (from the Lab tests tab). Change a lab cost there and every group updates.</p>`;
}

/* ---------------- tab: assumptions & rules ---------------- */
function psRules() {
  const W = PS.W, A = W.packages.cost_assumptions, D = Pricing.derivedCosts(A);
  const inp = (label, path, v, pct) => `<label class="field">${label}${numIn(pct ? +(v * 100).toFixed(2) : v, `data-k="set" data-path="${path}" ${pct ? 'data-pct="1"' : ''}`)}</label>`;
  const diff = Object.entries(D).filter(([c, v]) => Math.abs((Pricing.item(W, c)?.cost ?? 0) - v) > 0.005);
  return `<div class="grid c2">
    <div class="card" data-role="mgmt"><div class="mgmt-label">Management only</div><h3>Cost assumptions</h3>
      <div class="pkg-head">
        ${inp('Nutritionist daily wage (RM)', 'packages.cost_assumptions.nutritionist_daily_wage', A.nutritionist_daily_wage)}
        ${inp('60-min consults per day', 'packages.cost_assumptions.consults_per_day', A.consults_per_day)}
        ${inp('Tracking platform / user / month (RM)', 'packages.cost_assumptions.tracking_platform_per_user', A.tracking_platform_per_user)}
        ${inp('Tracking platform fixed / month (RM)', 'packages.cost_assumptions.tracking_platform_fixed_monthly', A.tracking_platform_fixed_monthly)}
        ${inp('Active tracking users', 'packages.cost_assumptions.tracking_active_users', A.tracking_active_users)}
        ${inp('Review minutes / week', 'packages.cost_assumptions.tracking_review_minutes_per_week', A.tracking_review_minutes_per_week)}
        ${inp('Weeks / month', 'packages.cost_assumptions.weeks_per_month', A.weeks_per_month)}
      </div>
      <div class="stat"><span>Nutritionist cost / minute</span><b>${rm(Pricing.perMinute(A))}</b></div>
      <table class="t" style="margin-top:8px"><tr><th>Item</th><th class="r">Current cost</th><th class="r">From assumptions</th></tr>
        ${Object.entries(D).map(([c, v]) => `<tr><td>${esc(Pricing.item(W, c)?.name_en || c)}</td><td class="r">${money(Pricing.item(W, c)?.cost)}</td><td class="r">${money(v)}</td></tr>`).join('')}</table>
      <button class="btn ${diff.length ? 'primary' : ''}" style="margin-top:10px" data-act="apply-derived" ${diff.length ? '' : 'disabled'}>${diff.length ? `Apply to ${diff.length} item cost${diff.length > 1 ? 's' : ''}` : 'Item costs match'}</button>
    </div>
    <div class="card"><h3>Business rules</h3>
      <div class="pkg-head">
        ${inp('Discount margin floor %', 'settings.discount_margin_floor', W.settings.discount_margin_floor, true)}
        ${inp('SST %', 'packages.sst_rate', W.packages.sst_rate, true)}
        <span data-role="mgmt">${inp('Payment fee %', 'packages.payment_fee_rate_default', W.packages.payment_fee_rate_default, true)}</span>
        ${inp('Leader override % of net', 'packages.commission_rules.leader_override.rate', W.packages.commission_rules.leader_override.rate, true)}
        ${inp('SMART → CLINICAL upgrade window (days)', 'packages.commission_rules.upgrade.window_days', W.packages.commission_rules.upgrade.window_days)}
      </div>
      <h3 style="margin-top:14px">Links</h3>
      <label class="field" style="margin-top:8px">Amanda's blood test tool (page 4)
        <input class="in" type="url" placeholder="https://…" value="${esc(W.settings.amanda_blood_test_tool_url ?? '')}" data-k="set-text" data-path="settings.amanda_blood_test_tool_url"></label>
    </div></div>`;
}

/* ---------------- tab: Excel import / export ---------------- */
function psExcel() {
  const ok = !!window.XLSX;
  return `<div class="grid c2">
    <div class="card"><h3>Export</h3><p class="muted">Downloads one Excel file with 4 sheets: Products, Lab Tests, Treatment Items, Blood Markers. Includes cost (Management file).</p>
      <button class="btn primary" data-act="xl-export" ${ok ? '' : 'disabled'}>Download price list (.xlsx)</button></div>
    <div class="card"><h3>Import</h3><p class="muted">Edit the exported file, then upload it here. You will see every change before anything is applied. Rows are matched by the <b>ID</b> column; rows with no ID are added as new products / lab tests.</p>
      <input type="file" accept=".xlsx,.xls" data-k="xl-import" ${ok ? '' : 'disabled'}>
      ${ok ? '' : '<p class="notice warn">Excel library did not load (needs internet).</p>'}</div>
  </div>${PS.imp ? psImportPreview() : ''}`;
}
function psImportPreview() {
  const { changes, adds, errors } = PS.imp;
  return `<div class="card" style="margin-top:14px"><h3>Changes found in the file</h3>
    ${errors.length ? `<div class="notice danger" style="margin:8px 0">${errors.map(esc).join('<br>')}</div>` : ''}
    ${!changes.length && !adds.length ? '<p class="muted">No changes.</p>' : `
    <div class="table-wrap"><table class="t"><tr><th>Sheet</th><th>Row</th><th>Field</th><th class="r">Now</th><th class="r">In file</th></tr>
      ${changes.map(c => `<tr><td>${c.sheet}</td><td>${esc(c.label)}</td><td>${c.field}</td><td class="r">${esc(c.from ?? '—')}</td><td class="r"><b>${esc(c.to ?? '—')}</b></td></tr>`).join('')}
      ${adds.map(a => `<tr><td>${a.sheet}</td><td>${esc(a.label)}</td><td colspan="3"><span class="chip ok">New row</span></td></tr>`).join('')}
    </table></div>
    <div class="toolbar" style="margin-top:12px"><button class="btn primary" data-act="xl-apply">Apply ${changes.length + adds.length} change(s)</button><button class="btn" data-act="xl-cancel">Cancel</button>
      <span class="muted" style="font-size:12.5px">Applied changes still need “Save changes”.</span></div>`}</div>`;
}

/* ---------------- events ---------------- */
function psSetPath(path, value) {
  const [file, ...keys] = path.split('.');
  let o = PS.W[file];
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
  psDirty(file);
}

function psChange(e, el) {
  const t = e.target, k = t.dataset.k, W = PS.W;
  if (!k || k === 'search') return;
  const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? parseNum(t.value) : t.value;
  const pv = t.dataset.pct && v != null ? Math.round(v * 100) / 10000 : v;
  const pk = () => W.packages.packages.find(p => p.code === t.dataset.code);
  const mk = () => Pricing.marker(W, t.dataset.code);
  const prod = () => W.products.products.find(p => p.id === t.dataset.id);
  switch (k) {
    case 'cat': PS.cat = v; break;
    case 'leader': PS.leader = v; break;
    case 'prod-price': psDirty(Pricing.setProduct(W, prod(), 'price', v)); break;
    case 'prod-cost': psDirty(Pricing.setProduct(W, prod(), 'cost', v)); break;
    case 'prod-name': if (v.trim()) { prod().name = v.trim(); psDirty('products'); } break;
    case 'prod-flag': prod()[t.dataset.f] = v; psDirty('products'); break;
    case 'lab-f': W.costCalc.master_tests[+t.dataset.i][t.dataset.f] = t.type === 'number' ? v : v.trim() || null; psDirty('costCalc'); break;
    case 'lab-flag': W.costCalc.master_tests[+t.dataset.i].discount_allowed = v; psDirty('costCalc'); break;
    case 'pkg-f': pk()[t.dataset.f] = pv; psDirty('packages'); break;
    case 'pkg-qty': {
      const list = pk()[t.dataset.list] ||= [];
      const field = t.dataset.list === 'included_items' && pk().line === 'CLINICAL' ? 'min_qty' : 'qty';
      let row = list.find(r => r.item === t.dataset.item);
      if (!row) list.push(row = field === 'min_qty' ? { item: t.dataset.item, min_qty: 0, locked: false } : { item: t.dataset.item, qty: 0 });
      row[field] = Math.max(0, Math.round(v ?? 0));
      if (field === 'min_qty' && row.min_qty === 0) pk().included_items = list.filter(r => r !== row);
      psDirty('packages'); break;
    }
    case 'pkg-row-add': if (v) { const p = pk(); (p.line === 'CLINICAL' ? (p.default_plan ||= []) : (p.included_items ||= [])).push({ item: v, qty: 1 }); psDirty('packages'); } break;
    case 'pool-add': if (v) { (pk().optional_pool ||= []).push(v); psDirty('packages'); } break;
    case 'mk-price': mk().price = v; psDirty('packages'); break;
    case 'mk-includes': mk().includes = v; psDirty('packages'); break;
    case 'mk-req': mk().required = v; psDirty('packages'); break;
    case 'mk-add': if (v) { (mk().lab_tests ||= []).push(v); psDirty('packages'); } break;
    case 'set': psSetPath(t.dataset.path, pv); break;
    case 'set-text': psSetPath(t.dataset.path, v.trim() || null); break;
    case 'xl-import': if (t.files[0]) psImportFile(t.files[0], el); return;
    default: return;
  }
  psRenderBody(el);
}

async function psClick(e, el) {
  const b = e.target.closest('[data-tab],[data-act]');
  if (!b) return;
  if (b.dataset.tab) { PS.tab = b.dataset.tab; psRender(el); return; }
  const W = PS.W, a = b.dataset.act, pk = () => W.packages.packages.find(p => p.code === b.dataset.code);
  switch (a) {
    case 'save': return psSave(el, b);
    case 'discard': if (confirm('Discard all unsaved changes?')) { psInit(); psRender(el); } return;
    case 'prod-use': { const p = W.products.products.find(x => x.id === b.dataset.id); psDirty(Pricing.setProduct(W, p, 'price', Pricing.suggested(Pricing.product(W, p).cost))); break; }
    case 'prod-del': if (!confirm('Remove this product?')) return; W.products.products = W.products.products.filter(p => p.id !== b.dataset.id); psDirty('products'); break;
    case 'prod-add': {
      const name = $('#npName', el).value.trim();
      if (!name) return toast('Enter a product name');
      const id = 'p-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (W.products.products.some(p => p.id === id || p.name.toLowerCase() === name.toLowerCase())) return toast('This product already exists');
      W.products.products.push({ id, name, category: $('#npCat', el).value, prepaid: $('#npPre', el).checked, discount_allowed: $('#npDisc', el).checked, remarks: '', price: parseNum($('#npPrice', el).value), cost: parseNum($('#npCost', el).value) });
      psDirty('products'); break;
    }
    case 'lab-use': { const t = W.costCalc.master_tests[+b.dataset.i]; t.selling = Pricing.suggested(Pricing.labCostHigh(t)); psDirty('costCalc'); break; }
    case 'lab-add': {
      const name = $('#nlName', el).value.trim();
      if (!name) return toast('Enter a test name');
      if (W.costCalc.master_tests.some(t => t.name.toLowerCase() === name.toLowerCase())) return toast('This test already exists');
      W.costCalc.master_tests.push({ name, eurofins_cost: parseNum($('#nlE', el).value), eurofins_code: $('#nlEc', el).value.trim() || null, innoquest_cost: parseNum($('#nlI', el).value), innoquest_code: $('#nlIc', el).value.trim() || null, selling: parseNum($('#nlSell', el).value), discount_allowed: true });
      psDirty('costCalc'); break;
    }
    case 'pkg-row-del': { const p = pk(), c = b.dataset.item; for (const l of ['included_items', 'default_plan']) if (p[l]) p[l] = p[l].filter(r => r.item !== c); psDirty('packages'); break; }
    case 'pkg-marker': { const p = pk(), m = b.dataset.m; p.default_blood_markers = p.default_blood_markers.includes(m) ? p.default_blood_markers.filter(x => x !== m) : [...p.default_blood_markers, m]; psDirty('packages'); break; }
    case 'pool-del': { const p = pk(); p.optional_pool = p.optional_pool.filter(c => c !== b.dataset.item); psDirty('packages'); break; }
    case 'mk-del': { const m = Pricing.marker(W, b.dataset.code); m.lab_tests = m.lab_tests.filter(n => n !== b.dataset.n); psDirty('packages'); break; }
    case 'apply-derived': for (const [c, v] of Object.entries(Pricing.derivedCosts(W.packages.cost_assumptions))) { const it = Pricing.item(W, c); if (it) it.cost = v; } psDirty('packages'); break;
    case 'xl-export': return psExport();
    case 'xl-apply': psImportApply(); break;
    case 'xl-cancel': PS.imp = null; break;
    default: return;
  }
  psRenderBody(el);
}

async function psSave(el, btn) {
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    for (const k of PS.dirty) {
      const obj = PS.W[k];
      obj._version = (obj._version || 0) + 1;      // price version: plans keep the price of the version they were sold on
      obj._updated = today();
      await Data.save(k, obj);
      PS.dirty.delete(k);
    }
    App.refresh();
    toast('Saved. Old versions are kept in data/_history/');
  } catch (err) {
    toast(err.message);
  }
  psRenderBody(el);
}

/* ---------------- Excel import / export ---------------- */
const YN = v => v ? 'Yes' : 'No';
const SHEETS = {
  'Products': {
    cols: ['ID', 'Name', 'Category', 'Linked to', 'Price', 'Cost', 'Discount Allowed', 'Prepaid', 'Remarks'],
    rows: W => W.products.products.map(p => { const r = Pricing.product(W, p); return [p.id, p.name, p.category, p.source ? `${p.source.type}:${p.source.code}` : '', r.price, r.cost, YN(p.discount_allowed), YN(p.prepaid), p.remarks || '']; }),
  },
  'Lab Tests': {
    cols: ['ID', 'Name', 'Eurofins Code', 'Eurofins Cost', 'Innoquest Code', 'Innoquest Cost', 'Selling', 'Discount Allowed'],
    rows: W => W.costCalc.master_tests.map(t => [t.name, t.name, t.eurofins_code, t.eurofins_cost, t.innoquest_code, t.innoquest_cost, t.selling, YN(t.discount_allowed !== false)]),
  },
  'Treatment Items': {
    cols: ['ID', 'Name (EN)', 'Name (ZH)', 'Unit', 'Price', 'Cost', 'Note'],
    rows: W => W.packages.items.filter(i => i.code !== 'blood_test').map(i => [i.code, i.name_en, i.name_zh, i.unit, i.price, i.cost, i.note || '']),
  },
  'Blood Markers': {
    cols: ['ID', 'Name', 'Price', 'Lab Tests (separate with |)', 'Cost (calculated, not imported)'],
    rows: W => W.packages.blood_markers.map(m => [m.code, m.name_en, m.price, (m.lab_tests || []).join(' | '), Pricing.markerCost(W, m)]),
  },
};

function psExport() {
  const wb = XLSX.utils.book_new();
  for (const [name, s] of Object.entries(SHEETS)) {
    const ws = XLSX.utils.aoa_to_sheet([s.cols, ...s.rows(PS.W)]);
    ws['!cols'] = s.cols.map((c, i) => ({ wch: i === 1 ? 44 : Math.max(10, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `Restore Price List ${today()}.xlsx`);
}

async function psImportFile(file, el) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const W = PS.W, changes = [], adds = [], errors = [];
  const read = name => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : null;
  const num = v => v == null || v === '' ? null : (isFinite(Number(v)) ? Number(v) : NaN);
  const yn = v => String(v ?? '').trim().toLowerCase() === 'yes';
  const same = (a, b) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005);
  const diff = (sheet, label, field, from, to, apply) => { if (Number.isNaN(to)) errors.push(`${sheet} · ${label}: “${field}” is not a number`); else if (!same(from, to)) changes.push({ sheet, label, field, from, to, apply }); };

  const prod = read('Products');
  if (prod) for (const r of prod) {
    const name = String(r.Name ?? '').trim(); if (!name) continue;
    const p = W.products.products.find(x => x.id === r.ID);
    if (!p) {
      if (r.ID) { errors.push(`Products: unknown ID “${r.ID}”`); continue; }
      adds.push({ sheet: 'Products', label: name, apply: () => W.products.products.push({ id: 'p-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, category: r.Category || 'Other', prepaid: yn(r.Prepaid), discount_allowed: yn(r['Discount Allowed']), remarks: r.Remarks || '', price: num(r.Price), cost: num(r.Cost) }) });
      continue;
    }
    const cur = Pricing.product(W, p);
    if (cur.editPrice) diff('Products', p.name, 'Price', cur.price, num(r.Price), v => psDirty(Pricing.setProduct(W, p, 'price', v)));
    if (cur.editCost) diff('Products', p.name, 'Cost', cur.cost, num(r.Cost), v => psDirty(Pricing.setProduct(W, p, 'cost', v)));
    diff('Products', p.name, 'Discount', YN(p.discount_allowed), YN(yn(r['Discount Allowed'])), v => { p.discount_allowed = v === 'Yes'; psDirty('products'); });
    diff('Products', p.name, 'Prepaid', YN(p.prepaid), YN(yn(r.Prepaid)), v => { p.prepaid = v === 'Yes'; psDirty('products'); });
    if (!p.source) diff('Products', p.name, 'Name', p.name, name, v => { p.name = v; psDirty('products'); });
  }
  const lab = read('Lab Tests');
  if (lab) for (const r of lab) {
    const name = String(r.Name ?? '').trim(); if (!name) continue;
    const t = W.costCalc.master_tests.find(x => x.name === r.ID);
    const F = [['Eurofins Code', 'eurofins_code', 0], ['Eurofins Cost', 'eurofins_cost', 1], ['Innoquest Code', 'innoquest_code', 0], ['Innoquest Cost', 'innoquest_cost', 1], ['Selling', 'selling', 1]];
    if (!t) {
      if (r.ID) { errors.push(`Lab Tests: unknown ID “${r.ID}” (renaming a test is not supported)`); continue; }
      const nt = { name, discount_allowed: yn(r['Discount Allowed']) };
      for (const [col, f, isNum] of F) nt[f] = isNum ? num(r[col]) : (r[col] ?? null);
      adds.push({ sheet: 'Lab Tests', label: name, apply: () => { W.costCalc.master_tests.push(nt); psDirty('costCalc'); } });
      continue;
    }
    for (const [col, f, isNum] of F) diff('Lab Tests', t.name, col, t[f], isNum ? num(r[col]) : (r[col] == null ? null : String(r[col]).trim()), v => { t[f] = v; psDirty('costCalc'); });
    diff('Lab Tests', t.name, 'Discount', YN(t.discount_allowed !== false), YN(yn(r['Discount Allowed'])), v => { t.discount_allowed = v === 'Yes'; psDirty('costCalc'); });
  }
  const items = read('Treatment Items');
  if (items) for (const r of items) {
    const it = Pricing.item(W, r.ID); if (!it) { if (r.ID) errors.push(`Treatment Items: unknown ID “${r.ID}” (add new items in restore_packages.json)`); continue; }
    diff('Treatment Items', it.name_en, 'Price', it.price, num(r.Price), v => { it.price = v; psDirty('packages'); });
    diff('Treatment Items', it.name_en, 'Cost', it.cost, num(r.Cost), v => { it.cost = v; psDirty('packages'); });
  }
  const mks = read('Blood Markers');
  if (mks) for (const r of mks) {
    const m = Pricing.marker(W, r.ID); if (!m) { if (r.ID) errors.push(`Blood Markers: unknown ID “${r.ID}”`); continue; }
    diff('Blood Markers', m.name_en, 'Price', m.price, num(r.Price), v => { m.price = v; psDirty('packages'); });
    const tests = String(r['Lab Tests (separate with |)'] ?? '').split('|').map(s => s.trim()).filter(Boolean);
    const unknown = tests.filter(n => !Pricing.labTest(W, n));
    if (unknown.length) errors.push(`Blood Markers · ${m.name_en}: lab test not found: ${unknown.join(', ')}`);
    else diff('Blood Markers', m.name_en, 'Lab tests', (m.lab_tests || []).join(' | '), tests.join(' | '), () => { m.lab_tests = tests; psDirty('packages'); });
  }
  if (!prod && !lab && !items && !mks) errors.push('No known sheets found. Use a file exported from this page.');
  PS.imp = { changes, adds, errors };
  psRenderBody(el);
}

function psImportApply() {
  for (const c of PS.imp.changes) c.apply(c.to);
  for (const a of PS.imp.adds) a.apply();
  toast(`${PS.imp.changes.length + PS.imp.adds.length} change(s) applied — press Save changes`);
  PS.imp = null;
}
