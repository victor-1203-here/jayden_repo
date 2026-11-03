/* Page 10 · My Sales & Commission (Agent only, own data).
 * Reads: CommissionAPI (server) for lines + rate table; sales (own) for "sales I recorded".
 * Shows commission amounts and % only — never cost or margin.
 */
'use strict';

const MS = { month: new Date().toISOString().slice(0, 7) };
const msMonths = n => { const out = [], d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1); } return out; };
const msLabel = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-MY', { month: 'short', year: 'numeric' });

Pages.mysales = ctx => {
  const el = document.createElement('div');
  const draw = () => { el.innerHTML = msPage(ctx); };
  el.addEventListener('change', e => { if (e.target.id === 'msMonth') { MS.month = e.target.value; draw(); } });
  draw();
  return el;
};

function msPage(ctx) {
  const me = ctx.user, all = CommissionAPI.linesFor(me.id), T = CommissionAPI.rateTable(me.id);
  const lines = all.filter(l => l.month === MS.month);
  const sum = (arr, st) => arr.filter(l => !st || l.status === st).reduce((a, l) => a + l.amount, 0);
  const own = ctx.data.sales.sales.filter(s => s.date.startsWith(MS.month));
  const months = msMonths(6);

  return `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
      <div><h1>My Sales & Commission</h1><p>Commission counts once Management confirms the customer has paid in full.</p></div>
      <select class="in" id="msMonth">${months.map(m => `<option value="${m}" ${m === MS.month ? 'selected' : ''}>${msLabel(m)}</option>`).join('')}</select></div>

    <div class="grid c3">
      <div class="card tile"><span class="muted">Confirmed commission</span><b class="money big">${rm(sum(lines, 'confirmed'))}</b><span class="muted" style="font-size:12px">To be paid for ${msLabel(MS.month)}</span></div>
      <div class="card tile"><span class="muted">Waiting for payment</span><b class="money big">${rm(sum(lines, 'pending'))}</b><span class="muted" style="font-size:12px">Counts after the customer pays in full</span></div>
      <div class="card tile"><span class="muted">Sales I made</span><b class="money big">${rm0(own.reduce((a, s) => a + s.amount_rm, 0))}</b><span class="muted" style="font-size:12px">${own.length} sale${own.length === 1 ? '' : 's'} this month</span></div>
    </div>

    <div class="card" style="margin-top:14px"><h3>Commission this month</h3>
      ${lines.length ? `<div class="table-wrap"><table class="t"><tr><th>Date</th><th>Customer · product</th><th>Why</th><th class="r">Rate</th><th class="r">Commission</th><th>Status</th></tr>
        ${lines.map(l => `<tr><td class="mono" style="font-size:12px">${l.date.slice(5)}</td><td>${esc(l.customer)}<div class="muted" style="font-size:11.5px">${esc(l.product)} · ${esc(l.company)}</div></td>
          <td>${esc(l.kind)}</td><td class="r">${l.rate}</td><td class="r money">${rm(l.amount)}</td>
          <td><span class="chip ${l.status === 'confirmed' ? 'ok' : 'warn'}">${l.status === 'confirmed' ? 'Confirmed' : 'Waiting'}</span></td></tr>`).join('')}</table></div>`
        : '<p class="muted">No commission this month yet.</p>'}
    </div>

    <div class="grid c2" style="margin-top:14px;align-items:start">
      <div class="card"><h3>My commission rates</h3>
        <table class="t" style="margin-top:6px"><tr><th>Package</th><th class="r">Per package</th></tr>
          ${T.packages.map(p => `<tr><td>${esc(p.name)}</td><td class="r money">${rm0(p.rm)}</td></tr>`).join('')}</table>
        <table class="t" style="margin-top:12px"><tr><th>Other sales</th><th class="r">Rate</th></tr>
          ${T.categories.map(c => `<tr><td>${esc(c.cat)}</td><td class="r">${c.pct}%</td></tr>`).join('')}
          ${T.products.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${c.pct}%</td></tr>`).join('')}</table>
        <ul class="plain muted" style="font-size:12.5px;margin-top:10px">
          <li>Package commission is paid after the customer pays the package in full.</li>
          <li>Customers you bring in stay yours. If a nutritionist sells them a package or a blood test later, you still get your rate. Anything else they buy later pays ${T.repeatOther}%.</li>
          <li>SMART upgraded to CLINICAL within ${T.windowDays} days: you get the difference (CLINICAL minus SMART commission), not both.</li>
          <li>% rates are on the amount before SST.</li>
        </ul>
      </div>
      <div class="card"><h3>Last 6 months</h3>
        <table class="t"><tr><th>Month</th><th class="r">Confirmed</th><th class="r">Waiting</th></tr>
          ${months.map(m => { const L = all.filter(l => l.month === m); return `<tr><td>${msLabel(m)}</td><td class="r money">${rm(sum(L, 'confirmed'))}</td><td class="r money">${sum(L, 'pending') ? rm(sum(L, 'pending')) : '—'}</td></tr>`; }).join('')}</table>
        ${T.team.length ? `<h3 style="margin-top:14px">My team</h3><p class="muted" style="font-size:12.5px;margin:4px 0">You get ${T.leaderPct}% of the net amount on your team's package sales.</p>
          <div class="chips">${T.team.map(t => `<span class="chip ${t.active ? 'ok' : ''}">${esc(t.name)}${t.active ? '' : ' · inactive'}</span>`).join('')}</div>` : ''}
      </div>
    </div>`;
}
