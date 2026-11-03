/* Page 2 · Customers  and  Page 3 · Customer Profile.
 * Reads: customers, sales, plans, people, settings. Writes: customers (one record at a time), uploads.
 * Scope: Management + Admin = all customers; Nutritionist = own (nutritionist_id); Agent = own (agent_id).
 * health_notes: Nutritionist + Management only. reports: not for Agents. (FIELD_POLICY / server)
 * Phone = customer ID, stored as 60XXXXXXXXX. Same phone can never be added twice (checked by the server).
 */
'use strict';

const CS = { q: '', due: false, adding: false, draft: null };

const CustAPI = {
  async post(url, body, raw) {
    const res = await fetch(url, raw ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !out.ok) throw new Error(out.error || 'Could not save. Open the portal with “Start Restore Portal.bat”.');
    return out;
  },
  async save(mode, customer) {
    await this.post('/api/customers/save', { mode, customer });
    await Data.reload('customers'); App.refresh();
  },
  async upload(phone, file) {
    return this.post(`/api/upload?phone=${phone}&name=${encodeURIComponent(file.name)}`, file, true);
  },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const dayDiff = ds => Math.round((new Date(ds + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000);
function csPerson(ctx, id) { return id ? ctx.data.people.people.find(p => p.id === id)?.name || '—' : '—'; }
function csLastSale(ctx, phone) { return ctx.data.sales.sales.filter(s => s.phone === phone).sort((a, b) => b.date.localeCompare(a.date))[0]; }
function csDue(fu) {
  if (!fu?.date) return '<span class="muted">—</span>';
  const n = dayDiff(fu.date);
  const cls = n < 0 ? 'pct-low' : n === 0 ? 'chip warn' : '';
  return `<span class="${cls}" title="${esc(fu.todo || '')}">${fu.date}${n < 0 ? ' · overdue' : n === 0 ? ' · today' : ''}</span>`;
}

/* ---------------- page 2: list ---------------- */
Pages.customers = ctx => {
  const el = document.createElement('div');
  const draw = () => { el.innerHTML = csList(ctx); };
  el.addEventListener('input', e => {
    if (e.target.id === 'csQ') { CS.q = e.target.value; el.querySelector('#csRows').innerHTML = csRows(ctx); }
    if (e.target.dataset.n === 'phone') { const out = el.querySelector('#csPhoneOut'); const p = normPhone(e.target.value); out.textContent = p ? 'Saved as ' + p : ''; }
  });
  el.addEventListener('change', e => { if (e.target.id === 'csDue') { CS.due = e.target.checked; el.querySelector('#csRows').innerHTML = csRows(ctx); } });
  el.addEventListener('click', async e => {
    const row = e.target.closest('[data-phone]');
    if (row) { location.hash = '#/customer/' + row.dataset.phone; return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'add') { CS.adding = true; draw(); el.querySelector('[data-n="name"]').focus(); }
    if (a === 'cancel') { CS.adding = false; draw(); }
    if (a === 'create') await csCreate(el, ctx);
  });
  draw();
  return el;
};

function csList(ctx) {
  const n = ctx.data.customers.customers.length;
  return `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
      <div><h1>Customers</h1><p>${ctx.scope === 'own' ? `Your customers (${n})` : `All customers (${n})`}. Phone number is the customer ID.</p></div>
      ${CS.adding ? '' : '<button class="btn primary" data-act="add">+ New customer</button>'}</div>
    ${CS.adding ? csNewForm(ctx) : ''}
    <div class="toolbar">
      <input class="in grow" id="csQ" type="search" placeholder="Search name or phone" value="${esc(CS.q)}">
      <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="csDue" ${CS.due ? 'checked' : ''}> Follow-up today or overdue</label>
    </div>
    <div class="card" style="padding:0" id="csRows">${csRows(ctx)}</div>`;
}

function csRows(ctx) {
  const q = CS.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  const list = ctx.data.customers.customers
    .filter(c => !q || c.name.toLowerCase().includes(q) || (qd.length >= 3 && c.phone.includes(qd.replace(/^0/, ''))))
    .filter(c => !CS.due || (c.follow_up?.date && dayDiff(c.follow_up.date) <= 0))
    .sort((a, b) => (a.follow_up?.date || '9999').localeCompare(b.follow_up?.date || '9999'));
  if (!list.length) return '<p class="muted" style="padding:16px">No customers found.</p>';
  return `<div class="cs-head"><span>Name</span><span>Person in charge</span><span>Agent</span><span>Last purchase</span><span>Next follow-up</span></div>` + list.map(c => {
    const s = csLastSale(ctx, c.phone);
    return `<div class="cs-row" data-phone="${c.phone}">
      <div><b>${esc(c.name)}</b><div class="muted mono" style="font-size:12px">${fmtPhone(c.phone)}</div></div>
      <div><span class="cs-lbl">In charge</span>${esc(csPerson(ctx, c.nutritionist_id))}</div>
      <div><span class="cs-lbl">Agent</span>${esc(csPerson(ctx, c.agent_id))}</div>
      <div><span class="cs-lbl">Last purchase</span>${s ? `${s.date}<div class="muted" style="font-size:12px">${esc(s.product)}</div>` : '<span class="muted">—</span>'}</div>
      <div><span class="cs-lbl">Follow-up</span>${csDue(c.follow_up)}${c.follow_up?.todo ? `<div class="muted" style="font-size:12px">${esc(c.follow_up.todo)}</div>` : ''}</div>
    </div>`;
  }).join('');
}

function csNewForm(ctx) {
  const P = ctx.data.people.people, S = ctx.data.settings;
  const agents = P.filter(p => p.role === 'agent' && p.active), nuts = P.filter(p => p.role === 'nutritionist' && p.active);
  const canPickNut = ctx.role === 'mgmt' || ctx.role === 'admin';
  return `<div class="card" style="margin-bottom:14px"><h3>New customer</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:10px">
      <label class="field">Name *<input class="in" data-n="name"></label>
      <label class="field">Phone *<input class="in" data-n="phone" inputmode="tel" placeholder="012-345 6789"><span id="csPhoneOut" class="mono" style="font-size:11px"></span></label>
      <label class="field">Gender<select class="in" data-n="gender"><option value="">—</option><option value="F">Female</option><option value="M">Male</option></select></label>
      <label class="field">Date of birth<input class="in" type="date" data-n="dob"></label>
      <label class="field">IC (for outstation blood test)<input class="in" data-n="ic" placeholder="680312-10-5678"></label>
      <label class="field">Customer source<select class="in" data-n="source"><option value="">—</option>${S.customer_sources.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label class="field">Referring agent${ctx.role === 'agent' ? `<input class="in" value="${esc(ctx.user.name)} (you)" disabled>` : `<select class="in" data-n="agent_id"><option value="">No agent</option>${agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>`}</label>
      ${canPickNut ? `<label class="field">Person in charge<select class="in" data-n="nutritionist_id"><option value="">Not yet</option>${nuts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">The referring agent cannot be changed later (customer stays with the original agent). Only Management can correct it.</p>
    <div class="toolbar" style="margin:12px 0 0"><button class="btn primary" data-act="create">Save customer</button><button class="btn" data-act="cancel">Cancel</button><span id="csErr" class="pct-low" style="font-size:13px"></span></div>
  </div>`;
}

async function csCreate(el, ctx) {
  const v = n => el.querySelector(`[data-n="${n}"]`)?.value.trim() || '';
  const err = t => { el.querySelector('#csErr').textContent = t; };
  const phone = normPhone(v('phone')), name = v('name');
  if (!name) return err('Enter the name');
  if (!/^60\d{8,11}$/.test(phone)) return err('Enter a valid Malaysian phone number');
  const c = {
    phone, name, gender: v('gender') || null, dob: v('dob') || null, ic: v('ic') || null, source: v('source') || null,
    agent_id: ctx.role === 'agent' ? ctx.user.id : v('agent_id') || null,
    nutritionist_id: ctx.role === 'nutritionist' ? ctx.user.id : v('nutritionist_id') || null,
    pdpa_signed: false, created: todayStr(), created_by: ctx.user.id, follow_up: { date: null, todo: '' }, health_notes: [], prepaid: [], reports: [],
  };
  try {
    await CustAPI.save('create', c);
    CS.adding = false; toast('Customer added');
    location.hash = '#/customer/' + phone;
  } catch (e) { err(e.message === 'This customer already exists' ? 'This customer already exists (same phone number).' : e.message); }
}

/* ---------------- page 3: profile ---------------- */
Pages.customer = ctx => {
  const phone = ctx.params[0];
  const c = ctx.data.customers.customers.find(x => x.phone === phone);
  const el = document.createElement('div');
  if (!c) { el.innerHTML = '<div class="card">Customer not found, or not one of your customers. <a href="#/customers">Back to customers</a></div>'; return el; }
  const role = ctx.role, seeNotes = role === 'mgmt' || role === 'nutritionist', seeReports = role !== 'agent';
  const canMgmt = role === 'mgmt', canAssign = role === 'mgmt' || role === 'admin';
  const P = ctx.data.people.people, S = ctx.data.settings;
  const sales = ctx.data.sales.sales.filter(s => s.phone === phone).sort((a, b) => b.date.localeCompare(a.date));
  const plans = (ctx.data.plans?.plans || []).filter(p => p.customer_phone === phone);
  const co = id => ctx.data.companies.companies.find(x => x.id === id)?.name || id;
  const sel = (n, list, cur, none) => `<select class="in" data-n="${n}"><option value="">${none}</option>${list.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;

  el.innerHTML = `
    <div class="page-head"><a href="#/customers" class="muted" style="font-size:12.5px;text-decoration:none">← Customers</a>
      <h1>${esc(c.name)}</h1>
      <p><span class="mono">${fmtPhone(c.phone)}</span> · <a href="https://wa.me/${c.phone}" target="_blank" rel="noopener">WhatsApp ↗</a>
        ${c.pdpa_signed ? ' · <span class="chip ok">PDPA signed</span>' : ' · <span class="chip warn">PDPA not signed</span>'}</p></div>
    <div class="grid c2" style="align-items:start">
      <div>
        <div class="card"><h3>Details</h3>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            <label class="field" style="grid-column:1/-1">Name<input class="in" data-n="name" value="${esc(c.name)}"></label>
            <label class="field">Gender<select class="in" data-n="gender"><option value="">—</option><option value="F" ${c.gender === 'F' ? 'selected' : ''}>Female</option><option value="M" ${c.gender === 'M' ? 'selected' : ''}>Male</option></select></label>
            <label class="field">Date of birth<input class="in" type="date" data-n="dob" value="${esc(c.dob || '')}"></label>
            <label class="field">IC<input class="in" data-n="ic" value="${esc(c.ic || '')}"></label>
            <label class="field">Source<select class="in" data-n="source"><option value="">—</option>${S.customer_sources.map(s => `<option ${s === c.source ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
            <label class="field">Person in charge${canAssign ? sel('nutritionist_id', P.filter(p => p.role === 'nutritionist'), c.nutritionist_id, 'Not yet') : `<input class="in" value="${esc(csPerson(ctx, c.nutritionist_id))}" disabled>`}</label>
            <label class="field">Referring agent${canMgmt ? sel('agent_id', P.filter(p => p.role === 'agent'), c.agent_id, 'No agent') : `<input class="in" value="${esc(csPerson(ctx, c.agent_id))}" disabled>`}</label>
            <label style="grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-n="pdpa_signed" ${c.pdpa_signed ? 'checked' : ''}> Customer has signed the PDPA consent form${c.pdpa_date ? ` <span class="muted">(${c.pdpa_date})</span>` : ''}</label>
          </div>
          <button class="btn primary" style="margin-top:12px" data-act="save-details">Save details</button>
        </div>

        <div class="card"><h3>Follow-up</h3>
          <div class="toolbar" style="margin:10px 0 0">
            <input class="in" type="date" data-n="fu_date" value="${esc(c.follow_up?.date || '')}">
            <input class="in grow" data-n="fu_todo" placeholder="What to do" value="${esc(c.follow_up?.todo || '')}">
            <button class="btn primary" data-act="save-fu">Save</button></div>
        </div>

        ${seeNotes ? `<div class="card"><h3>Health notes</h3><p class="muted" style="font-size:12px;margin:2px 0 10px">Consult notes, main concerns, feedback. Only nutritionists and Management can see this.</p>
          ${(c.health_notes || []).length ? [...c.health_notes].reverse().map(n => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted" style="font-size:12px">${n.date} · ${esc(csPerson(ctx, n.by))}</div><div style="white-space:pre-wrap">${esc(n.text)}</div></div>`).join('') : '<p class="muted">No notes yet.</p>'}
          <textarea class="in" data-n="note" rows="3" style="width:100%;margin-top:10px" placeholder="Add a note"></textarea>
          <button class="btn" style="margin-top:8px" data-act="add-note">Add note</button></div>` : ''}
      </div>

      <div>
        <div class="card"><h3>Purchases</h3>
          ${sales.length ? `<div class="table-wrap"><table class="t">${sales.map(s => `<tr><td>${s.date}</td><td>${esc(s.product)}<div class="muted" style="font-size:11.5px">${esc(co(s.company))}</div></td><td class="r money">${rm0(s.amount_rm)}</td><td><span class="chip ${s.status === 'confirmed' ? 'ok' : 'warn'}">${s.status === 'confirmed' ? 'Paid' : 'Pending'}</span></td></tr>`).join('')}</table></div>` : '<p class="muted">No purchases yet.</p>'}
          ${(c.prepaid || []).length ? `<h3 style="margin-top:14px">Prepaid balance</h3><table class="t">${c.prepaid.map(p => {
            const left = p.total_rm - p.used_rm, n = p.valid_until ? dayDiff(p.valid_until) : null;
            return `<tr><td>${esc(p.product)}</td><td class="r money">${rm0(left)} left of ${rm0(p.total_rm)}</td><td>${p.valid_until ? `<span class="${n < 0 ? 'pct-low' : n <= S.prepaid_expiry_warning_days ? 'chip warn' : ''}">Valid until ${p.valid_until}</span>` : ''}</td></tr>`;
          }).join('')}</table>` : ''}
        </div>

        ${plans.length ? `<div class="card"><h3>CLINICAL plans</h3>${plans.map(p => `<div class="stat"><a href="#/planner/${p.id}">${esc(PlannerAPI.pkg(p.package_code)?.name_en || p.package_code)}</a><span class="chip">${esc(STATUS[p.status]?.label || p.status)}</span></div>`).join('')}</div>` : ''}

        <div class="card"><h3>Quotations</h3><p class="muted" style="font-size:12.5px">Quotations are made in Amanda's blood test tool (page 4). They will show here once her tool is connected to the system.</p></div>

        ${seeReports ? `<div class="card"><h3>Blood test reports</h3>
          ${(c.reports || []).length ? c.reports.map(r => `<div class="stat"><a href="${esc(r.path)}" target="_blank" rel="noopener">${esc(r.name)}</a><span class="muted" style="font-size:12px">${r.date} · ${esc(csPerson(ctx, r.by))}</span></div>`).join('') : '<p class="muted">No reports yet.</p>'}
          <label class="btn" style="margin-top:10px;cursor:pointer">Upload PDF<input type="file" accept="application/pdf" data-n="report" hidden></label></div>` : ''}
      </div>
    </div>`;

  const v = n => el.querySelector(`[data-n="${n}"]`);
  const save = async (patch, msg) => {
    try { await CustAPI.save('update', { phone, ...patch }); toast(msg); App.route(); } catch (e) { toast(e.message); }
  };
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'save-details') {
      if (!v('name').value.trim()) return toast('Name cannot be empty');
      const patch = { name: v('name').value.trim(), gender: v('gender').value || null, dob: v('dob').value || null, ic: v('ic').value.trim() || null, source: v('source').value || null, pdpa_signed: v('pdpa_signed').checked };
      if (patch.pdpa_signed && !c.pdpa_signed) patch.pdpa_date = todayStr();
      if (canAssign) patch.nutritionist_id = v('nutritionist_id').value || null;
      if (canMgmt) patch.agent_id = v('agent_id').value || null;
      return save(patch, 'Details saved');
    }
    if (a === 'save-fu') return save({ follow_up: { date: v('fu_date').value || null, todo: v('fu_todo').value.trim() } }, 'Follow-up saved');
    if (a === 'add-note') {
      const text = v('note').value.trim(); if (!text) return toast('Write a note first');
      return save({ health_notes: [...(c.health_notes || []), { date: todayStr(), by: ctx.user.id, text }] }, 'Note added');
    }
  });
  el.addEventListener('change', async e => {
    if (e.target.dataset.n !== 'report' || !e.target.files[0]) return;
    const f = e.target.files[0];
    if (f.type !== 'application/pdf') return toast('Please choose a PDF');
    try {
      const up = await CustAPI.upload(phone, f);
      await save({ reports: [...(c.reports || []), { path: up.path, name: f.name, date: todayStr(), by: ctx.user.id }] }, 'Report uploaded');
    } catch (err) { toast(err.message); }
  });
  return el;
};
