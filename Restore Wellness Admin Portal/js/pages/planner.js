/* Page 9 · CLINICAL Planner.
 * Nutritionist: selling prices, value, budget used %, warnings. Never cost / budget RM / profit.
 * Management: everything, plus approve / reject.
 * Reads: packages, customers, people, plans (+ cost via PlannerAPI = server). Writes: plans.
 */
'use strict';

const PLS = { plan: null, showOut: false, company: 'restore' };
const STATUS = {
  draft:          { label: 'Draft', cls: '' },
  submitted:      { label: 'Active', cls: 'ok' },
  needs_approval: { label: 'Needs approval', cls: 'warn' },
  approved:       { label: 'Approved', cls: 'ok' },
  rejected:       { label: 'Rejected', cls: 'warn' },
};
const ACTIVE = s => s === 'submitted' || s === 'approved';
const pctFmt = v => (v * 100).toFixed(0) + '%';
const months = days => Math.round(days / 30.4) + ' 个月';

Pages.planner = ctx => {
  const id = ctx.params[0];
  const el = document.createElement('div');
  el.addEventListener('click', e => plClick(e, el, ctx));
  el.addEventListener('change', e => plChange(e, el, ctx));
  if (!id) { PLS.plan = null; el.innerHTML = plList(ctx); return el; }
  if (id === 'new') { if (!PLS.plan || PLS.plan.id) PLS.plan = plNew(ctx); }
  else if (!PLS.plan || PLS.plan.id !== id) {
    const p = ctx.data.plans.plans.find(x => x.id === id);
    if (!p) { el.innerHTML = '<div class="card">Plan not found.</div>'; return el; }
    PLS.plan = clone(p);
  }
  PLS.showOut = false;
  plRenderEditor(el, ctx);
  return el;
};

/* ---------------- list ---------------- */
function plCustomerName(ctx, phone) { return ctx.data.customers.customers.find(c => c.phone === phone)?.name || fmtPhone(phone); }
function plPerson(ctx, id) { return ctx.data.people.people.find(p => p.id === id)?.name || '—'; }

function plList(ctx) {
  const plans = [...ctx.data.plans.plans].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const waiting = plans.filter(p => p.status === 'needs_approval').length;
  return `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
      <div><h1>CLINICAL Planner</h1><p>Plan each CLINICAL customer's treatments within the package budget.${ctx.role === 'mgmt' && waiting ? ` <span class="chip warn">${waiting} waiting for your approval</span>` : ''}</p></div>
      <a class="btn primary" href="#/planner/new">+ New plan</a></div>
    <div class="card table-wrap" style="padding:6px 8px">
    ${plans.length ? `<table class="t">
      <tr><th>Customer</th><th>Package</th>${ctx.role === 'mgmt' ? '<th>Nutritionist</th>' : ''}<th>Status</th><th class="r">Budget used</th><th class="r">Value / target</th><th class="r">Sessions done</th><th>Updated</th></tr>
      ${plans.map(p => {
        const ev = PlannerAPI.evaluate(p, ctx.role), pk = PlannerAPI.pkg(p.package_code), st = STATUS[p.status] || STATUS.draft;
        const planned = Object.values(p.qty).reduce((a, b) => a + b, 0), used = (p.usage || []).reduce((a, u) => a + u.qty, 0);
        return `<tr style="cursor:pointer" data-open="${p.id}">
          <td><b>${esc(plCustomerName(ctx, p.customer_phone))}</b><div class="muted mono" style="font-size:11.5px">${fmtPhone(p.customer_phone)}</div></td>
          <td>${esc(pk?.name_en || p.package_code)}</td>${ctx.role === 'mgmt' ? `<td>${esc(plPerson(ctx, p.nutritionist_id))}</td>` : ''}
          <td><span class="chip ${st.cls}">${st.label}</span></td>
          <td class="r"><span class="${ev.overBudget ? 'pct-low' : ''}">${pctFmt(ev.usedPct)}</span></td>
          <td class="r money">${rm0(ev.value)} / ${rm0(ev.valueTarget)}</td>
          <td class="r">${ACTIVE(p.status) ? `${used} / ${planned}` : '—'}</td>
          <td class="muted">${p.updated || ''}</td></tr>`;
      }).join('')}</table>` : '<p class="muted" style="padding:12px">No plans yet. Press “New plan” to make the first one.</p>'}
    </div>`;
}

/* ---------------- new plan ---------------- */
function plClinical() { return Data.raw.packages.packages.filter(p => p.line === 'CLINICAL'); }
function plDefaults(code) {
  const pk = PlannerAPI.pkg(code);
  return { markers: [...(pk.default_blood_markers || [])], qty: Object.fromEntries((pk.default_plan || []).map(r => [r.item, r.qty])) };
}
function plNew(ctx) {
  const pk = plClinical()[0];
  return { id: null, customer_phone: '', package_code: pk.code, nutritionist_id: ctx.role === 'nutritionist' ? ctx.user.id : null,
    status: 'draft', created: new Date().toISOString().slice(0, 10), usage: [], ...plDefaults(pk.code) };
}

/* ---------------- editor ---------------- */
function plRenderEditor(el, ctx) {
  const P = PLS.plan, mgmt = ctx.role === 'mgmt';
  const editable = P.status === 'draft' || P.status === 'rejected';
  const pk = PlannerAPI.pkg(P.package_code), D = ctx.data;
  const ev = PlannerAPI.evaluate(P, ctx.role);
  const st = STATUS[P.status] || STATUS.draft;
  const items = D.packages.items;
  const poster = Object.fromEntries((pk.included_items || []).map(r => [r.item, r.min_qty ?? r.qty ?? 0]));
  const shown = new Set([...Object.keys(poster), ...(pk.default_plan || []).map(r => r.item), ...(pk.optional_pool || []), ...Object.keys(P.qty)]);
  const rowOf = Object.fromEntries(ev.rows.map(r => [r.item, r]));
  const dis = editable ? '' : 'disabled';

  const groups = D.packages.item_groups.map(g => {
    const list = items.filter(i => i.group === g.name_en && shown.has(i.code));
    if (!list.length) return '';
    return `<tr class="sub"><td colspan="${mgmt ? 6 : 4}"><b>${esc(g.name_en)}</b> <span class="muted">${esc(g.name_zh)}</span></td></tr>` + list.map(i => {
      const q = P.qty[i.code] || 0, r = rowOf[i.code];
      const unitPrice = i.code === 'blood_test' ? ev.blood.price : (r?.price ?? i.price);
      return `<tr><td><b>${esc(i.name_en)}</b> ${poster[i.code] ? `<span class="chip" title="Quantity on the package poster">Poster ${poster[i.code]}</span>` : ''}
          <div class="muted" style="font-size:11.5px">${esc(i.name_zh)} · per ${esc(i.unit)}</div></td>
        <td class="r money">${unitPrice == null ? '—' : rm(unitPrice)}</td>
        ${mgmt ? `<td class="r money" data-role="mgmt">${r?.unit_cost != null ? rm(r.unit_cost) : i.code === 'blood_test' && ev.bloodCost != null ? rm(ev.bloodCost) : i.cost != null ? rm(i.cost) : '—'}</td>` : ''}
        <td class="r"><div class="stepper"><button class="btn" data-step="-1" data-item="${i.code}" ${dis}>−</button><input class="in num sm" type="number" min="0" value="${q}" data-k="qty" data-item="${i.code}" ${dis}><button class="btn" data-step="1" data-item="${i.code}" ${dis}>+</button></div></td>
        <td class="r money">${q ? rm0((unitPrice || 0) * q) : '<span class="muted">—</span>'}</td>
        ${mgmt ? `<td class="r money" data-role="mgmt">${r?.cost != null && q ? rm0(r.cost) : '—'}</td>` : ''}</tr>
        ${i.code === 'blood_test' ? plMarkerRow(P, ev, mgmt, dis) : ''}`;
    }).join('');
  }).join('');
  const others = items.filter(i => !shown.has(i.code));

  const customers = D.customers.customers;
  el.innerHTML = `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
      <div><a href="#/planner" class="muted" style="font-size:12.5px;text-decoration:none">← All plans</a>
        <h1>${P.id ? esc(plCustomerName(ctx, P.customer_phone)) : 'New plan'} <span class="chip ${st.cls}" style="vertical-align:middle">${st.label}</span></h1>
        <p>${esc(pk.name_en)} · ${esc(pk.name_zh)} · ${months(pk.duration_days)}${P.snapshot ? ` · prices locked on ${P.snapshot.taken} (price list v${P.snapshot.price_version})` : ''}</p></div></div>

    ${P.decision?.note && P.status === 'rejected' ? `<div class="notice danger" style="margin-bottom:12px">Rejected by ${esc(plPerson(ctx, P.decision.by))}: ${esc(P.decision.note)}</div>` : ''}

    <div class="planner-grid">
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="pkg-head" style="margin:0">
            <label class="field" style="flex:1;min-width:200px">Customer
              <select class="in" data-k="customer" ${editable && !P.id ? '' : 'disabled'}><option value="">Choose customer…</option>
                ${customers.map(c => `<option value="${c.phone}" ${c.phone === P.customer_phone ? 'selected' : ''}>${esc(c.name)} · ${fmtPhone(c.phone)}</option>`).join('')}</select></label>
            <label class="field" style="flex:1;min-width:200px">Package
              <select class="in" data-k="package" ${dis}>${plClinical().map(p => `<option value="${p.code}" ${p.code === P.package_code ? 'selected' : ''}>${esc(p.name_en)} · ${rm0(p.price_incl_sst)}</option>`).join('')}</select></label>
            ${mgmt ? `<label class="field">Nutritionist<select class="in" data-k="nutritionist" ${dis}>${D.people.people.filter(p => p.role === 'nutritionist').map(p => `<option value="${p.id}" ${p.id === P.nutritionist_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
          </div>
          ${editable ? `<p class="muted" style="font-size:12.5px;margin:10px 0 0">Start from the package's default plan, choose this customer's blood markers, then add or reduce treatments. Keep the budget at or under 100% and the value at or above the target.</p>` : ''}
        </div>

        <div class="card table-wrap" style="padding:6px 8px">
          <table class="t">
            <tr><th>Item</th><th class="r">Unit price</th>${mgmt ? '<th class="r" data-role="mgmt">Unit cost</th>' : ''}<th class="r">Qty</th><th class="r">Value</th>${mgmt ? '<th class="r" data-role="mgmt">Cost</th>' : ''}</tr>
            ${groups}
            ${editable && others.length ? `<tr><td colspan="${mgmt ? 6 : 4}"><select class="in" data-k="add-item"><option value="">+ Add another item…</option>${others.map(i => `<option value="${i.code}">${esc(i.name_en)}</option>`).join('')}</select></td></tr>` : ''}
          </table>
        </div>
        ${ACTIVE(P.status) ? plUsage(P, ev, ctx) : ''}
      </div>
      <div class="planner-side">${plSummary(P, ev, ctx, editable)}</div>
    </div>
    ${PLS.showOut ? plOutput(P, ev, ctx) : ''}`;
}

function plMarkerRow(P, ev, mgmt, dis) {
  const Ms = Data.raw.packages.blood_markers;
  return `<tr><td colspan="${mgmt ? 6 : 4}" style="padding-top:0">
    <div class="marker-box">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px"><b style="font-size:12.5px">Blood markers for each test (same set every time)</b>
        <span class="${ev.blood.overCap ? 'pct-low' : 'muted'}" style="font-size:12.5px">${rm0(ev.blood.price)} per test · suggested max ${rm0(ev.blood.cap)}</span></div>
      <div class="marker-list">${Ms.map(m => `<label class="marker"><input type="checkbox" data-k="marker" data-m="${m.code}" ${m.required || P.markers.includes(m.code) ? 'checked' : ''} ${m.required || dis ? 'disabled' : ''}>
        <span><b>${esc(m.name_en)}</b>${m.required ? ' <span class="chip">Always</span>' : ''}<small>${esc(m.includes)}</small></span><span class="money">${rm0(m.price)}</span></label>`).join('')}</div>
      ${ev.blood.overCap ? '<p class="pct-low" style="font-size:12.5px;margin:6px 0 0">Above the suggested maximum. Remove a marker, or this plan will need Management approval.</p>' : ''}
    </div></td></tr>`;
}

function plSummary(P, ev, ctx, editable) {
  const mgmt = ctx.role === 'mgmt', E = ev.econ;
  const chips = [
    ev.overBudget ? `<span class="chip warn" style="color:var(--danger);background:var(--danger-soft)">Over budget by ${pctFmt(ev.usedPct - 1)}</span>` : '<span class="chip ok">Within budget</span>',
    ev.valueShort > 0 ? `<span class="chip warn">Value short by ${rm0(ev.valueShort)}</span>` : '<span class="chip ok">Value target met</span>',
    ev.blood.overCap ? '<span class="chip warn">Blood test above max</span>' : '',
  ].join(' ');
  const vp = ev.valueTarget ? ev.value / ev.valueTarget : 0;
  let actions = '';
  if (editable) {
    actions = `<button class="btn" data-act="save-draft">Save draft</button>
      <button class="btn primary" data-act="submit" ${P.customer_phone ? '' : 'disabled title="Choose a customer first"'}>${ev.needsApproval ? 'Send for approval' : 'Submit plan'}</button>
      <button class="link-btn" data-act="reset">Reset to package default</button>`;
  } else if (P.status === 'needs_approval') {
    actions = mgmt ? `<input class="in" id="decNote" placeholder="Note (optional)" style="width:100%">
      <button class="btn primary" data-act="approve">Approve</button><button class="btn" data-act="reject">Reject</button>`
      : '<p class="muted" style="margin:0;font-size:12.5px">Waiting for Management approval.</p>';
    actions += `<button class="link-btn" data-act="reopen">Back to draft</button>`;
  } else if (ACTIVE(P.status) && !(P.usage || []).length) {
    actions = `<button class="link-btn" data-act="reopen">Back to draft (edit)</button>`;
  }
  return `<div class="card">
      <div class="stat"><span>Package price</span><b>${rm0(ev.package_price)}</b></div>
      <div style="margin:10px 0 4px;font-size:12.5px;display:flex;justify-content:space-between"><span>Budget used</span><b class="${ev.overBudget ? 'pct-low' : ''}">${pctFmt(ev.usedPct)}</b></div>
      <div class="bar"><i class="${ev.overBudget ? 'over' : ''}" style="width:${Math.min(100, ev.usedPct * 100)}%"></i></div>
      <div class="muted" style="font-size:11.5px;margin-top:3px">Poster items use ${pctFmt(ev.posterPct)} of the budget</div>
      <div style="margin:12px 0 4px;font-size:12.5px;display:flex;justify-content:space-between"><span>Plan value / target</span><b class="money">${rm0(ev.value)} / ${rm0(ev.valueTarget)}</b></div>
      <div class="bar"><i class="${vp < 1 ? 'short' : ''}" style="width:${Math.min(100, vp * 100)}%"></i></div>
      <div class="chips" style="margin-top:12px">${chips}</div>
      ${mgmt && E ? `<div data-role="mgmt" style="margin-top:14px;padding:10px 12px;background:var(--surface-2);border-radius:8px">
        <div class="mgmt-label">Management only</div>
        <div class="stat"><span>Net</span><b>${rm(E.net)}</b></div>
        <div class="stat"><span>Agent commission</span><b>−${rm(E.commission)}</b></div>
        ${ev.leader_override ? `<div class="stat"><span>Leader override</span><b>−${rm(E.override)}</b></div>` : ''}
        <div class="stat"><span>Payment fee</span><b>−${rm(E.fee)}</b></div>
        <div class="stat"><span>Lock</span><b>${rm(E.lock)}</b></div>
        <div class="stat"><span>Treatment budget</span><b>${rm(E.budget)}</b></div>
        <div class="stat"><span>Plan cost</span><b class="${ev.overBudget ? 'pct-low' : ''}">${rm(ev.cost)}</b></div>
        <div class="stat"><span>Profit</span><b>${rm(ev.profit)} · ${pctFmt(ev.profitPctNet)} of net</b></div>
      </div>` : ''}
      <div class="plan-actions">${actions}</div>
      ${P.customer_phone ? '<button class="btn" style="width:100%;margin-top:10px" data-act="output">Customer version (WhatsApp / PDF)</button>' : ''}
    </div>`;
}

/* ---------------- customer output ---------------- */
function plOutputData(P, ev) {
  const items = Data.raw.packages.items, pk = PlannerAPI.pkg(P.package_code);
  const poster = Object.fromEntries((pk.included_items || []).map(r => [r.item, r.min_qty ?? r.qty ?? 0]));
  const markerNames = Data.raw.packages.blood_markers.filter(m => m.required || P.markers.includes(m.code)).map(m => m.name_zh).join('、');
  const name = code => code === 'blood_test' ? `深度验血（${markerNames}）` : items.find(i => i.code === code)?.name_zh || code;
  const unit = code => items.find(i => i.code === code)?.unit || '';
  const inc = [], add = [];
  for (const r of ev.rows) {
    const a = Math.min(r.qty, poster[r.item] || 0), b = r.qty - a;
    if (a) inc.push({ name: name(r.item), qty: a, unit: unit(r.item), value: r.price * a });
    if (b) add.push({ name: name(r.item), qty: b, unit: unit(r.item), value: r.price * b });
  }
  return { pk, inc, add };
}
function plText(P, ev, ctx) {
  const { pk, inc, add } = plOutputData(P, ev);
  const line = x => `• ${x.name} × ${x.qty}${x.unit}（价值 ${rm0(x.value)}）`;
  return `Restore ${pk.name_zh}（${months(pk.duration_days)}）\n${plCustomerName(ctx, P.customer_phone)} 的个人调理方案\n\n【配套包含】\n${inc.map(line).join('\n')}`
    + (add.length ? `\n\n【按你的情况加配】\n${add.map(line).join('\n')}` : '')
    + `\n\n方案总价值：${rm0(ev.value)}\n配套价格：${rm0(ev.package_price)}`;
}
function plOutput(P, ev, ctx) {
  const cos = Data.raw.companies.companies;
  return `<div class="modal-scrim" data-act="close-out"><div class="modal" data-stop="1">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>Customer version</h3><button class="x-btn" data-act="close-out">✕</button></div>
    <p class="muted" style="font-size:12.5px;margin:4px 0 10px">Shows selling prices and value only. No cost, budget or profit.</p>
    <textarea class="in" id="outText" readonly style="width:100%;height:280px;font-size:13px">${esc(plText(P, ev, ctx))}</textarea>
    <div class="toolbar" style="margin:10px 0 0">
      <button class="btn primary" data-act="copy-out">Copy for WhatsApp</button>
      <span class="grow"></span>
      <select class="in" data-k="company">${cos.map(c => `<option value="${c.id}" ${c.id === PLS.company ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button class="btn" data-act="print-out">Print / save as PDF</button>
    </div></div></div>`;
}
function plPrint(P, ev, ctx) {
  const { pk, inc, add } = plOutputData(P, ev);
  const co = Data.raw.companies.companies.find(c => c.id === PLS.company);
  const rows = list => list.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${x.qty} ${esc(x.unit)}</td><td class="r">${rm0(x.value)}</td></tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(plCustomerName(ctx, P.customer_phone))} · ${esc(pk.name_zh)}</title>
    <style>body{font:14px/1.6 "Noto Sans SC","Microsoft YaHei",sans-serif;color:#16211B;margin:40px;max-width:720px}
    h1{font-size:20px;margin:0}h2{font-size:15px;margin:24px 0 6px;color:#1D6A4C}.co{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1D6A4C;padding-bottom:12px;margin-bottom:20px}
    .co img{height:44px}.co small{color:#5B6B62;display:block}table{width:100%;border-collapse:collapse}td{padding:7px 4px;border-bottom:1px solid #DCE4DD}.r{text-align:right}
    .tot{margin-top:18px;font-size:15px}.tot div{display:flex;justify-content:space-between;padding:4px 0}</style></head><body>
    <div class="co"><div><b style="font-size:16px">${esc(co.legal_name || co.name)}</b>${co.reg_no ? `<small>${esc(co.reg_no)}</small>` : ''}${co.address ? `<small>${esc(co.address)}</small>` : ''}</div>${co.logo ? `<img src="${location.origin}/${co.logo}" alt="">` : ''}</div>
    <h1>${esc(plCustomerName(ctx, P.customer_phone))} 的个人调理方案</h1><div style="color:#5B6B62">Restore ${esc(pk.name_zh)} · ${months(pk.duration_days)}</div>
    <h2>配套包含</h2><table>${rows(inc)}</table>
    ${add.length ? `<h2>按你的情况加配</h2><table>${rows(add)}</table>` : ''}
    <div class="tot"><div><span>方案总价值</span><b>${rm0(ev.value)}</b></div><div><span>配套价格</span><b>${rm0(ev.package_price)}</b></div></div>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ---------------- session tracking (same record as Sales Tracker > Package Usage) ---------------- */
function plUsage(P, ev, ctx) {
  const used = {};
  for (const u of P.usage || []) used[u.item] = (used[u.item] || 0) + u.qty;
  const items = Data.raw.packages.items, nm = c => items.find(i => i.code === c)?.name_en || c;
  const left = ev.rows.filter(r => r.qty - (used[r.item] || 0) > 0);
  return `<div class="card" style="margin-top:14px"><h3>Sessions done</h3>
    <p class="muted" style="font-size:12.5px;margin:4px 0 10px">Record each session when it is done. This is the same record as “Package Usage” in the Sales Tracker; the Developer will write it to the Google Sheet.</p>
    <div class="table-wrap"><table class="t"><tr><th>Item</th><th class="r">Planned</th><th class="r">Done</th><th class="r">Left</th></tr>
      ${ev.rows.map(r => `<tr><td>${esc(nm(r.item))}</td><td class="r">${r.qty}</td><td class="r">${used[r.item] || 0}</td><td class="r"><b>${r.qty - (used[r.item] || 0)}</b></td></tr>`).join('')}</table></div>
    ${left.length ? `<div class="toolbar" style="margin-top:12px">
      <select class="in" id="usItem">${left.map(r => `<option value="${r.item}">${esc(nm(r.item))} (${r.qty - (used[r.item] || 0)} left)</option>`).join('')}</select>
      <input class="in num sm" type="number" min="1" value="1" id="usQty">
      <input class="in" type="date" id="usDate" value="${new Date().toISOString().slice(0, 10)}">
      <input class="in grow" id="usNote" placeholder="Remarks (optional)">
      <button class="btn primary" data-act="record">Record</button></div>` : '<p class="chip ok" style="margin-top:10px">All sessions done</p>'}
    ${(P.usage || []).length ? `<details style="margin-top:12px"><summary class="muted" style="cursor:pointer;font-size:12.5px">History (${P.usage.length})</summary>
      <table class="t">${[...P.usage].reverse().map(u => `<tr><td>${u.date}</td><td>${esc(nm(u.item))} × ${u.qty}</td><td class="money">${rm0(u.amount_rm)}</td><td>${esc(plPerson(ctx, u.by))}</td><td class="muted">${esc(u.note || '')}</td></tr>`).join('')}</table></details>` : ''}
  </div>`;
}

/* ---------------- events ---------------- */
function plChange(e, el, ctx) {
  const t = e.target, k = t.dataset.k, P = PLS.plan;
  if (!k || !P) return;
  if (k === 'customer') {
    P.customer_phone = t.value;
    const c = Data.raw.customers.customers.find(x => x.phone === t.value);
    if (ctx.role === 'mgmt' && c?.nutritionist_id) P.nutritionist_id = c.nutritionist_id;
  } else if (k === 'package') {
    if (!confirm('Change package? Quantities and markers will reset to the new package default.')) { t.value = P.package_code; return; }
    P.package_code = t.value; Object.assign(P, plDefaults(t.value));
  } else if (k === 'nutritionist') P.nutritionist_id = t.value;
  else if (k === 'qty') P.qty[t.dataset.item] = Math.max(0, parseInt(t.value) || 0);
  else if (k === 'marker') P.markers = t.checked ? [...new Set([...P.markers, t.dataset.m])] : P.markers.filter(m => m !== t.dataset.m);
  else if (k === 'add-item') { if (!t.value) return; P.qty[t.value] = 1; }
  else if (k === 'company') { PLS.company = t.value; return; }
  else return;
  plRenderEditor(el, ctx);
}

async function plClick(e, el, ctx) {
  const open = e.target.closest('[data-open]');
  if (open) { location.hash = '#/planner/' + open.dataset.open; return; }
  const step = e.target.closest('[data-step]');
  if (step && PLS.plan) { const c = step.dataset.item; PLS.plan.qty[c] = Math.max(0, (PLS.plan.qty[c] || 0) + +step.dataset.step); plRenderEditor(el, ctx); return; }
  const b = e.target.closest('[data-act]');
  if (!b || (b.dataset.act === 'close-out' && e.target.closest('[data-stop]') && !e.target.closest('.x-btn'))) return;
  const P = PLS.plan, a = b.dataset.act;
  const run = async (action, note) => {
    if (!P.customer_phone) return toast('Choose a customer first');
    if (!P.id) {
      P.id = 'pl-' + Date.now().toString(36);
      if (!P.nutritionist_id) P.nutritionist_id = Data.raw.customers.customers.find(c => c.phone === P.customer_phone)?.nutritionist_id || ctx.user.id;
    }
    // keep only items with qty > 0
    P.qty = Object.fromEntries(Object.entries(P.qty).filter(([, q]) => q > 0));
    try {
      const saved = await PlannerAPI.save(P, action, ctx.role, ctx.user, note);
      PLS.plan = clone(App.data.plans.plans.find(x => x.id === saved.id) || saved);
      toast({ draft: 'Draft saved', submit: saved.status === 'needs_approval' ? 'Sent to Management for approval' : 'Plan submitted', approve: 'Approved', reject: 'Rejected', reopen: 'Back to draft', usage: 'Session recorded' }[action]);
      if (location.hash !== '#/planner/' + saved.id) { location.hash = '#/planner/' + saved.id; return; }
      plRenderEditor(el, ctx);
    } catch (err) { toast(err.message); }
  };
  switch (a) {
    case 'save-draft': return run('draft');
    case 'submit': return run('submit');
    case 'approve': return run('approve', $('#decNote', el)?.value);
    case 'reject': { const n = $('#decNote', el)?.value || prompt('Reason for rejecting (shown to the nutritionist):') || ''; return run('reject', n); }
    case 'reopen': if (confirm('Move this plan back to draft? Its locked prices will be released.')) return run('reopen'); return;
    case 'reset': if (confirm('Reset quantities and markers to the package default?')) { Object.assign(P, plDefaults(P.package_code)); plRenderEditor(el, ctx); } return;
    case 'record': {
      const item = $('#usItem', el).value, qty = Math.max(1, parseInt($('#usQty', el).value) || 1);
      const ev = PlannerAPI.evaluate(P, ctx.role), row = ev.rows.find(r => r.item === item);
      const left = row.qty - (P.usage || []).filter(u => u.item === item).reduce((s, u) => s + u.qty, 0);
      if (qty > left) return toast(`Only ${left} left for this item`);
      (P.usage ||= []).push({ date: $('#usDate', el).value, item, qty, amount_rm: row.price * qty, by: ctx.user.id, note: $('#usNote', el).value.trim() });
      return run('usage');
    }
    case 'output': PLS.showOut = true; plRenderEditor(el, ctx); return;
    case 'close-out': PLS.showOut = false; plRenderEditor(el, ctx); return;
    case 'copy-out': {
      const txt = $('#outText', el).value;
      try { await navigator.clipboard.writeText(txt); toast('Copied'); } catch { $('#outText', el).select(); document.execCommand('copy'); toast('Copied'); }
      return;
    }
    case 'print-out': return plPrint(P, PlannerAPI.evaluate(P, ctx.role), ctx);
  }
}
