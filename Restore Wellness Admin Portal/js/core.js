/* Restore Wellness Admin Portal — core: data layer, roles, permissions, helpers.
 *
 * DEVELOPER NOTE
 * In this front-end build every JSON file is loaded in the browser and then passed
 * through Data.view(role, user), which removes fields and rows the role may not see.
 * That function is the spec for the server: in production the API must apply the
 * same filtering BEFORE sending data, so a non-Management browser never receives cost.
 */
'use strict';

const ROLES = [
  { id: 'mgmt',         label: 'Management' },
  { id: 'admin',        label: 'Admin' },
  { id: 'nutritionist', label: 'Nutritionist' },
  { id: 'agent',        label: 'Agent' },
];

/* Data files. `mgmtOnly: true` = the whole raw file is Management data; other roles get a filtered view. */
const DATA_FILES = {
  costCalc:  { path: 'data/cost_calc_data.json',      mgmtOnly: true },
  quotation: { path: 'data/quotation_data.json' },
  centers:   { path: 'data/innoquest_centers.json' },
  iqForm:    { path: 'data/innoquest_form.json' },
  packages:  { path: 'data/restore_packages.json' },
  products:  { path: 'data/products.json' },
  companies: { path: 'data/companies.json' },
  settings:  { path: 'data/app_settings.json' },
  people:    { path: 'data/mock/people.json' },
  customers: { path: 'data/mock/customers.json' },
  sales:     { path: 'data/mock/sales.json' },
  plans:     { path: 'data/mock/plans.json' },
  commissionRates: { path: 'data/commission_rates.json' },
};

/* Field-level access. Any object key listed here is removed for roles not in its list,
 * wherever it appears in any data file. SERVER MUST APPLY THE SAME RULES. */
const FIELD_POLICY = {
  // costs & margins — Management only
  cost:                     ['mgmt'],
  eurofins_cost:            ['mgmt'],
  innoquest_cost:           ['mgmt'],
  eurofins:                 ['mgmt'],   // quotation_data: numeric lab cost
  innoquest:                ['mgmt'],   // quotation_data: numeric lab cost
  lock_pct:                 ['mgmt'],
  payment_fee_rate_default: ['mgmt'],
  clinical_budget_formula:  ['mgmt'],
  unit_cost:                ['mgmt'],   // plans: cost snapshot per item
  econ:                     ['mgmt'],   // plans: net, commission, fee, lock, budget, profit
  cost_assumptions:         ['mgmt'],
  // commission amounts — Management + the agent (page 10 shows only their own)
  agent_commission_rm:      ['mgmt', 'agent'],
  // health notes — nutritionist + Management
  health_notes:             ['mgmt', 'nutritionist'],
  // blood test report PDFs — not for agents (health data)
  reports:                  ['mgmt', 'admin', 'nutritionist'],
  // Innoquest lab contacts — internal (Admin + Management)
  lab_pic:                  ['mgmt', 'admin'],
  lab_email:                ['mgmt', 'admin'],
};

/* Pages. scope per role: 'all' | 'own' | 'price' (sell price only) | 'cost' (sees cost) | true. Missing = no access. */
const PAGES = [
  { id: 'dashboard',  num: 1,  title: 'Dashboard',              group: 'General',      roles: { mgmt: 'all', admin: true, nutritionist: true, agent: 'own' }, build: 10 },
  { id: 'customers',  num: 2,  title: 'Customers',              group: 'General',      roles: { mgmt: 'all', admin: 'all', nutritionist: 'own', agent: 'own' }, build: 7 },
  { id: 'customer',   num: 3,  title: 'Customer Profile',       group: 'General',      roles: { mgmt: 'all', admin: 'all', nutritionist: 'own', agent: 'own' }, build: 7, hidden: true },
  { id: 'sales',      num: 15, title: 'Sales',                  group: 'General',      roles: { mgmt: 'all', admin: 'all', nutritionist: 'own', agent: 'own' }, build: 'added' },
  { id: 'bloodtest',  num: 4, title: 'Blood Test Customize',   group: 'General',      roles: { mgmt: 'cost', admin: 'price', nutritionist: 'price', agent: 'price' }, build: 3 },
  { id: 'prices',     num: 5,  title: 'Price Lookup',           group: 'General',      roles: { mgmt: 'cost', admin: 'price', nutritionist: 'price', agent: 'price' }, build: 5 },
  { id: 'outstation', num: 6,  title: 'Outstation Blood Test',  group: 'Admin',        roles: { mgmt: true, admin: true }, build: 6 },
  { id: 'po',         num: 7,  title: 'Create PO',              group: 'Admin',        roles: { mgmt: true, admin: true }, build: 'v2' },
  { id: 'planner',    num: 9,  title: 'CLINICAL Planner',       group: 'Nutritionist', roles: { mgmt: 'cost', nutritionist: 'price' }, build: 4 },
  { id: 'mysales',    num: 10, title: 'My Sales & Commission',  group: 'Agent',        roles: { agent: 'own' }, build: 8 },
  { id: 'costcalc',   num: 11, title: 'Cost Calculator',        group: 'Management',   roles: { mgmt: true }, build: 'v2' },
  { id: 'pricing',    num: 12, title: 'Price & Cost Settings',  group: 'Management',   roles: { mgmt: true }, build: 2 },
  { id: 'people',     num: 13, title: 'People & Roles',         group: 'Management',   roles: { mgmt: true }, build: 9 },
  { id: 'payouts',    num: 14, title: 'Departments & Payouts',  group: 'Management',   roles: { mgmt: true }, build: 'v2' },
];

/* ---------------- data layer ---------------- */
const Data = {
  raw: {},

  async load() {
    if (location.protocol === 'file:') throw new Error('FILE_PROTOCOL');
    const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([key, f]) => {
      const res = await fetch(f.path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Cannot load ${f.path} (${res.status})`);
      return [key, await res.json()];
    }));
    this.raw = Object.fromEntries(entries);
  },

  /* Save one data file (local server: server.py). Production: API, Management only for price/cost files. */
  async save(key, obj) {
    const res = await fetch('/api/save?file=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !body.ok) {
      throw new Error(body.error || (res ? `Save failed (${res.status}). Open the portal with “Start Restore Portal.bat”.` : 'Server not running'));
    }
    this.raw[key] = clone(obj);
    return body;
  },

  async reload(key) {
    const res = await fetch(DATA_FILES[key].path, { cache: 'no-store' });
    this.raw[key] = await res.json();
  },

  /* What a role is allowed to receive. Mirrors the server-side filter. */
  view(role, user) {
    const out = {};
    for (const [key, val] of Object.entries(this.raw)) out[key] = stripFields(clone(val), role);
    // row-level scope: nutritionist / agent only get their own customers & sales
    if (role === 'nutritionist' && out.customers) {
      out.customers.customers = out.customers.customers.filter(c => c.nutritionist_id === user?.id);
      const mine = new Set(out.customers.customers.map(c => c.phone));
      if (out.sales) out.sales.sales = out.sales.sales.filter(s => mine.has(s.phone));
      if (out.plans) out.plans.plans = out.plans.plans.filter(p => p.nutritionist_id === user?.id);
    }
    if ((role === 'agent' || role === 'admin') && out.plans) out.plans.plans = [];
    if (role === 'agent') {
      if (out.customers) out.customers.customers = out.customers.customers.filter(c => c.agent_id === user?.id);
      if (out.sales) out.sales.sales = out.sales.sales.filter(s => s.agent_id === user?.id);
    }
    if (role === 'admin' && out.customers) {
      out.customers.customers.forEach(c => delete c.health_notes);
    }
    return out;
  },
};

function stripFields(node, role) {
  if (Array.isArray(node)) return node.map(n => stripFields(n, role));
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const allowed = FIELD_POLICY[k];
      if (allowed && !allowed.includes(role)) delete node[k];
      else node[k] = stripFields(node[k], role);
    }
  }
  return node;
}

/* ---------------- helpers ---------------- */
const clone = o => JSON.parse(JSON.stringify(o));
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rm = v => (v < 0 ? '−' : '') + 'RM ' + Math.abs(Math.round(v * 100) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = v => (v < 0 ? '−' : '') + 'RM ' + Math.round(Math.abs(v)).toLocaleString('en-MY');

/* Phone = customer ID. Always stored as 60XXXXXXXXX (digits only). */
function normPhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('60')) return d;
  if (d.startsWith('0')) return '6' + d;
  return '60' + d;
}
const fmtPhone = p => { const d = normPhone(p); return d ? '+' + d.slice(0, 2) + ' ' + d.slice(2, 4) + '-' + d.slice(4, 7) + ' ' + d.slice(7) : ''; };

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

const store = {
  get(k, d = null) { try { const v = localStorage.getItem('rw.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rw.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
