/* Page 5 · Price Lookup (all roles).
 * Reads: products, packages, costCalc (lab tests). Writes: nothing.
 * Everyone: selling price, category, discount allowed. Management also: cost + margin (data-role="mgmt").
 * Non-Management roles receive data with cost already removed (Data.view / server), so cost is null for them.
 */
'use strict';

const PRS = { q: '', cat: '' };
const PR_CAT_ORDER = ['Package', 'Blood Test', 'Lab test', 'Consultation', 'Course', 'Supplement', 'Center Service', 'Prepaid Package'];

function prRows(d) {
  const items = d.packages.items;
  const rows = d.products.products.map(p => {
    const r = Pricing.product(d, p);
    let detail = p.remarks || '';
    if (p.source?.type === 'package') {
      const pk = d.packages.packages.find(x => x.code === p.source.code);
      const list = pk.line === 'CLINICAL' ? pk.included_items.map(i => ({ item: i.item, qty: i.min_qty })) : pk.included_items;
      const mo = Math.round(pk.duration_days / 30.4);
      detail = `${mo} month${mo > 1 ? 's' : ''} · ` + list.map(i => `${items.find(x => x.code === i.item)?.name_en || i.item} × ${i.qty}`).join(', ');
    } else if (p.source?.type === 'marker') {
      detail = Pricing.marker(d, p.source.code)?.includes || detail;
    } else if (p.source?.type === 'fixed_package') {
      detail = d.costCalc.fixed_packages[p.source.code].items.join(', ');
    }
    return { name: p.name, cat: p.category, price: r.price, cost: r.cost, costNote: r.costNote, discount: p.discount_allowed, prepaid: p.prepaid, detail };
  });
  for (const t of d.costCalc.master_tests) {
    const cost = Pricing.labCostHigh(t);
    rows.push({ name: t.name, cat: 'Lab test', price: t.selling, cost, discount: t.discount_allowed !== false,
      detail: [t.eurofins_code && `Eurofins ${t.eurofins_code}`, t.innoquest_code && `Innoquest ${t.innoquest_code}`].filter(Boolean).join(' · ') });
  }
  const rank = c => { const i = PR_CAT_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  return rows.sort((a, b) => rank(a.cat) - rank(b.cat));
}

Pages.prices = ctx => {
  const el = document.createElement('div');
  const all = prRows(ctx.data);
  const mgmt = ctx.role === 'mgmt', agent = ctx.role === 'agent';
  const floor = ctx.data.settings.discount_margin_floor;
  const cats = PR_CAT_ORDER.filter(c => all.some(r => r.cat === c));

  const draw = () => {
    const q = PRS.q.trim().toLowerCase();
    const rows = all.filter(r => (!PRS.cat || r.cat === PRS.cat) && (!q || r.name.toLowerCase().includes(q) || (r.detail || '').toLowerCase().includes(q)));
    el.querySelector('#prList').innerHTML = rows.length ? rows.map(r => {
      const m = Pricing.margin(r.price, r.cost);
      return `<div class="pr-row">
        <div class="pr-main"><b>${esc(r.name)}</b>
          <div class="muted pr-sub"><span class="chip">${esc(r.cat)}</span>${r.prepaid ? ' <span class="chip">Prepaid</span>' : ''} ${esc(r.detail)}</div></div>
        <div class="pr-price">
          <b class="money">${r.price == null ? 'Per quotation' : rm(r.price)}</b>
          <span class="chip ${r.discount && !agent ? 'ok' : ''}">${agent ? 'No discount' : r.discount ? 'Discount OK' : 'No discount'}</span>
          ${r.price != null ? `<button class="link-btn" data-copy="${esc(r.name)}: ${rm(r.price)}">Copy</button>` : ''}
        </div>
        ${mgmt ? `<div class="pr-cost" data-role="mgmt"><span class="mgmt-label">Cost</span> <span class="money">${r.cost != null ? rm(r.cost) : r.costNote ? esc(r.costNote) : 'not set'}</span>
          <span class="mgmt-label" style="margin-left:8px">Margin</span> ${m == null ? '<span class="muted">—</span>' : `<span class="${m < floor ? 'pct-low' : 'pct-good'}">${(m * 100).toFixed(0)}%</span>`}</div>` : ''}
      </div>`;
    }).join('') : '<p class="muted" style="padding:16px">Nothing found.</p>';
    el.querySelector('#prCount').textContent = `${rows.length} of ${all.length}`;
    el.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('ok', b.dataset.cat === PRS.cat));
  };

  el.innerHTML = `
    <div class="page-head"><h1>Price Lookup</h1>
      <p>All packages, blood tests, services and products with their selling price.${mgmt ? ' Cost and margin are shown to Management only.' : ''}</p></div>
    ${agent ? '<div class="notice" style="margin-bottom:12px">Agents cannot give discounts. Quote the price shown.</div>' : ''}
    <div class="toolbar">
      <input class="in grow" id="prQ" type="search" placeholder="Search name, marker or lab code" value="${esc(PRS.q)}">
      <span class="muted" id="prCount" style="font-size:12.5px"></span>
    </div>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip" data-cat="">All</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="card" style="padding:0" id="prList"></div>`;

  el.querySelector('#prQ').addEventListener('input', e => { PRS.q = e.target.value; draw(); });
  el.addEventListener('click', async e => {
    const c = e.target.closest('[data-cat]');
    if (c) { PRS.cat = c.dataset.cat; draw(); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copied'); } catch { toast(cp.dataset.copy); } }
  });
  draw();
  return el;
};
