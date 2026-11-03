/* Restore Wellness Admin Portal — shell: role switcher, menu, router. */
'use strict';

/* Page renderers register here: Pages[id] = (ctx) => html string | Node.  ctx = { role, user, data, page, scope, params } */
const Pages = window.Pages = window.Pages || {};

/* Short brief for pages not built yet (from docs/00_页面清单_给ClaudeCode.md). */
const PAGE_INFO = {
  dashboard:  { what: ['Customers to follow up today, prepaid packages expiring soon', 'This month: quotations made, deals closed', 'Management: pending agent applications, pending payment confirmations'], reads: ['customers', 'sales'] },
  customers:  { what: ['Search by name or phone', 'Columns: name, phone, person in charge, agent, last purchase, next follow-up', 'Add customer: name, phone, gender, DOB, IC, source, referring agent', 'Same phone cannot be added twice'], reads: ['customers', 'people'], writes: ['customers'] },
  customer:   { what: ['Profile + PDPA consent tick', 'Quotation history, purchases, prepaid balance & Valid Until', 'Health notes (nutritionist + Management only)', 'Blood test report PDF upload', 'Follow-up date + to-do'], reads: ['customers', 'sales'], writes: ['customers'] },
  prices:     { what: ['Search all blood tests, packages, supplements, centre services', 'Shows selling price, category, discount allowed', 'Management also sees cost and margin'], reads: ['costCalc', 'packages', 'quotation'] },
  outstation: { what: ['Pick state → branch cards: address, hours, phone, copy address for customer', 'Internal: lab email & PIC', 'Fill the new Innoquest form PDF (doctor VRDU21 and Bill to VRLF2 are pre-printed)'], reads: ['centers'] },
  po:         { what: ['Version 2 — keep using the old Verdulife Admin Portal for now', 'Company selector (default Verdulife), supplier, PO no., recipients, products → PDF'], reads: ['companies'] },
  planner:    { what: ['CLINICAL package planner per docs/CLINICAL_Treatment_Planner_Spec.md', 'Locked minimum items, budget used %, value vs target', 'Nutritionist never receives cost, budget RM, commission, fee, lock or profit'], reads: ['packages', 'costCalc'], writes: ['plans'] },
  mysales:    { what: ['This month sales, confirmed and pending commission', 'Fixed RM commission per package, paid after full payment', 'Source of each commission, last 6 months'], reads: ['sales', 'packages'] },
  costcalc:   { what: ['Version 2 — keep using the old Verdulife Admin Portal for now', 'Two-lab cost comparison, cheapest X3T / X8T / X12T combination, Innoquest codes'], reads: ['costCalc'] },
  pricing:    { what: ['Add products, edit selling price and cost (default price = cost / 0.4, can override)', 'Discount allowed per item, margin floor (now 50%)', 'Import / export price list (Excel)', 'CLINICAL item prices, package settings and cost assumptions'], reads: ['costCalc', 'packages', 'settings'], writes: ['costCalc', 'packages', 'settings'] },
  people:     { what: ['Add people, set role, deactivate account', 'Agent team leader, nutritionist probation'], reads: ['people'], writes: ['people'] },
  payouts:    { what: ['Version 2', 'Confirm payments, commission to pay this month, department sales, Excel download'], reads: ['sales', 'people'] },
};

const App = {
  role: null, user: null, data: null,

  async start() {
    const root = $('#root');
    try {
      await Data.load();
    } catch (e) {
      root.innerHTML = e.message === 'FILE_PROTOCOL'
        ? `<div class="boot err"><h2>Please open the portal with the start file</h2>
           <p>This page reads its data from the <b>data</b> folder, which the browser blocks when the file is opened directly.</p>
           <p>Double-click <b>Start Restore Portal.bat</b> in the portal folder instead.</p></div>`
        : `<div class="boot err"><h2>Could not load data</h2><pre>${esc(e.message)}</pre></div>`;
      return;
    }
    this.role = store.get('role', 'mgmt');
    if (!ROLES.some(r => r.id === this.role)) this.role = 'mgmt';
    this.pickUser(store.get('user.' + this.role));
    this.renderShell();
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  peopleFor(role) { return Data.raw.people.people.filter(p => p.role === role && p.active); },

  pickUser(id) {
    const list = this.peopleFor(this.role);
    this.user = list.find(p => p.id === id) || list[0] || null;
    store.set('user.' + this.role, this.user?.id);
    this.data = Data.view(this.role, this.user);   // ← server-side filter in production
  },

  /* call after Data.save() so every page sees the new data */
  refresh() { this.data = Data.view(this.role, this.user); },

  visiblePages() { return PAGES.filter(p => p.roles[this.role]); },

  renderShell() {
    $('#root').innerHTML = `
      <div class="app" id="app">
        <aside class="side" id="side">
          <div class="brand"><div class="brand-mark">RW</div><div><b>Restore Wellness</b><small>Admin Portal</small></div></div>
          <nav class="nav" id="nav"></nav>
          <div class="side-foot">Front-end build · fake data<br>Login & permissions: Developer</div>
        </aside>
        <div class="scrim" id="scrim"></div>
        <div class="main">
          <header class="topbar">
            <button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>
            <div class="title" id="pageTitle"></div>
            <div class="role-box" title="Testing only. Developer replaces this with login.">
              <label>Test role</label>
              <select id="roleSel">${ROLES.map(r => `<option value="${r.id}">${r.label}</option>`).join('')}</select>
              <select id="userSel"></select>
            </div>
          </header>
          <main class="content" id="view"></main>
        </div>
      </div>`;
    $('#roleSel').value = this.role;
    $('#roleSel').onchange = e => {
      this.role = e.target.value; store.set('role', this.role);
      this.pickUser(store.get('user.' + this.role));
      this.fillUserSel(); this.renderNav(); this.route();
    };
    $('#userSel').onchange = e => { this.pickUser(e.target.value); this.route(); };
    $('#menuBtn').onclick = () => $('#app').classList.toggle('nav-open');
    $('#scrim').onclick = () => $('#app').classList.remove('nav-open');
    this.fillUserSel(); this.renderNav();
  },

  fillUserSel() {
    const list = this.peopleFor(this.role);
    $('#userSel').innerHTML = list.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('#userSel').value = this.user?.id || '';
  },

  renderNav() {
    let html = '', group = '';
    for (const p of this.visiblePages()) {
      if (p.hidden) continue;
      if (p.group !== group) { group = p.group; html += `<div class="nav-group">${group}</div>`; }
      const tag = p.build === 'v2' ? '<span class="tag">v2</span>' : '';
      html += `<a href="#/${p.id}" data-id="${p.id}"><span class="num">${p.num}</span>${esc(p.title)}${tag}</a>`;
    }
    $('#nav').innerHTML = html;
  },

  route() {
    const [id, ...params] = location.hash.replace(/^#\/?/, '').split('/');
    const pages = this.visiblePages();
    let page = pages.find(p => p.id === id);
    if (!page) { page = pages.find(p => !p.hidden); if (page) { location.replace('#/' + page.id); return; } }
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === page?.id));
    $('#app').classList.remove('nav-open');
    $('#pageTitle').textContent = page ? `${page.num} · ${page.title}` : '';
    document.title = (page ? page.title + ' · ' : '') + 'Restore Wellness Admin';
    const view = $('#view');
    if (!page) { view.innerHTML = '<div class="card">No pages for this role.</div>'; return; }
    const ctx = { role: this.role, user: this.user, data: this.data, page, scope: page.roles[this.role], params: params.map(decodeURIComponent) };
    const out = (Pages[page.id] || placeholder)(ctx);
    if (typeof out === 'string') view.innerHTML = out; else { view.innerHTML = ''; view.appendChild(out); }
    window.scrollTo(0, 0);
  },
};

/* Generic page for pages not built yet. */
function placeholder(ctx) {
  const { page, role } = ctx;
  const info = PAGE_INFO[page.id] || { what: [] };
  const step = page.build === 'v2' ? '<span class="chip">Version 2</span>' : `<span class="chip warn">Build step ${page.build} of 10</span>`;
  const access = ROLES.map(r => {
    const s = page.roles[r.id];
    const label = !s ? '✕' : s === true ? '✓' : { all: 'All', own: 'Own only', price: 'Selling price only', cost: 'Sees cost' }[s];
    return `<tr><td>${r.label}</td><td>${label}</td></tr>`;
  }).join('');
  return `
    <div class="page-head"><h1>${esc(page.title)}</h1><p>Page ${page.num} · not built yet ${step}</p></div>
    <div class="grid c2">
      <div class="card"><h3>What this page will do</h3><ul class="plain">${info.what.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
      <div class="card">
        <h3>Access</h3>
        <div class="table-wrap"><table class="t">${access}</table></div>
        <p class="muted" style="margin:10px 0 0;font-size:12.5px">Reads: ${(info.reads || []).map(r => `<span class="mono">${r}</span>`).join(', ') || '—'}${info.writes ? ` · Writes: ${info.writes.map(r => `<span class="mono">${r}</span>`).join(', ')}` : ''}</p>
      </div>
    </div>`;
}

/* ---- Page 4: Blood Test Customize = link to Amanda's tool (not rebuilt in this system) ---- */
Pages.bloodtest = ctx => {
  const url = ctx.data.settings.amanda_blood_test_tool_url;
  return `
    <div class="page-head"><h1>Blood Test Customize</h1><p>Page 4 · built by Amanda as a separate tool. This system links to it.</p></div>
    <div class="card">
      ${url
        ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Open Amanda's blood test tool ↗</a>`
        : `<div class="notice warn">The link to Amanda's tool is not set yet. Management can add it in <b>data/app_settings.json</b> → <span class="mono">amanda_blood_test_tool_url</span> (later on page 12).</div>`}
      <h3 style="margin-top:18px">Discount rules (in Amanda's tool)</h3>
      <ul class="plain">
        <li>Whole-quote margin must stay at or above the floor (now ${Math.round(ctx.data.settings.discount_margin_floor * 100)}%). Non-Management roles only see “discount too low”, never the margin.</li>
        <li>IV drip and TCM practitioner services cannot be discounted.</li>
        <li>Agents cannot give discounts.</li>
      </ul>
    </div>`;
};

window.addEventListener('DOMContentLoaded', () => App.start());
