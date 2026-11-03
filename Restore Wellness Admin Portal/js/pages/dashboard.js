/* Page 1 · Dashboard (all roles). Summary only — every number comes from the other pages' data.
 * Reads: customers, sales, plans, people, settings, CommissionAPI (agents). Writes: nothing.
 * Scope follows Data.view(): nutritionist = own customers, agent = own customers + own sales.
 */
'use strict';

Pages.dashboard = ctx => {
  const D = ctx.data, role = ctx.role, today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
  const days = ds => Math.round((new Date(ds + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  const custName = ph => D.customers.customers.find(c => c.phone === ph)?.name || fmtPhone(ph);
  const warnDays = D.settings.prepaid_expiry_warning_days;

  const follow = D.customers.customers.filter(c => c.follow_up?.date && days(c.follow_up.date) <= 0)
    .sort((a, b) => a.follow_up.date.localeCompare(b.follow_up.date));
  const upcoming = D.customers.customers.filter(c => c.follow_up?.date && days(c.follow_up.date) > 0 && days(c.follow_up.date) <= 7).length;
  const expiring = D.customers.customers.flatMap(c => (c.prepaid || []).filter(p => p.valid_until && days(p.valid_until) <= warnDays && p.total_rm - p.used_rm > 0)
    .map(p => ({ c, p, n: days(p.valid_until) }))).sort((a, b) => a.n - b.n);

  const mSales = D.sales.sales.filter(s => s.date.startsWith(month));   // already scoped by Data.view
  const closed = mSales.filter(s => s.status === 'confirmed');
  const pending = D.sales.sales.filter(s => s.status !== 'confirmed').sort((a, b) => a.date.localeCompare(b.date));
  const plans = D.plans?.plans || [];
  const waitPlans = plans.filter(p => p.status === 'needs_approval');
  const drafts = plans.filter(p => p.status === 'draft' || p.status === 'rejected');

  const tiles = [];
  tiles.push(`<a class="card tile dash-link" href="#/customers"><span class="muted">Follow up today</span><b class="big">${follow.length}</b><span class="muted" style="font-size:12px">${upcoming} more in the next 7 days</span></a>`);
  tiles.push(`<div class="card tile"><span class="muted">Deals closed · ${new Date(month + '-01T00:00:00').toLocaleDateString('en-MY', { month: 'short' })}</span><b class="big">${closed.length}</b><span class="muted money" style="font-size:12px">${rm0(closed.reduce((a, s) => a + s.amount_rm, 0))} paid</span></div>`);
  tiles.push(`<div class="card tile"><span class="muted">Quotations this month</span><b class="big">—</b><span class="muted" style="font-size:12px">Shows once Amanda's tool is connected</span></div>`);
  if (role === 'agent') {
    const L = CommissionAPI.linesFor(ctx.user.id).filter(l => l.month === month);
    tiles.push(`<a class="card tile dash-link" href="#/mysales"><span class="muted">My commission · this month</span><b class="big money">${rm0(L.filter(l => l.status === 'confirmed').reduce((a, l) => a + l.amount, 0))}</b><span class="muted" style="font-size:12px">${rm0(L.filter(l => l.status !== 'confirmed').reduce((a, l) => a + l.amount, 0))} waiting for payment</span></a>`);
  }
  if (role === 'nutritionist') tiles.push(`<a class="card tile dash-link" href="#/planner"><span class="muted">CLINICAL plans</span><b class="big">${drafts.length}</b><span class="muted" style="font-size:12px">draft${drafts.length === 1 ? '' : 's'} · ${waitPlans.length} waiting for approval</span></a>`);
  if (role === 'mgmt') tiles.push(`<div class="card tile"><span class="muted">Waiting for you</span><b class="big">${pending.length + waitPlans.length}</b><span class="muted" style="font-size:12px">${pending.length} payment${pending.length === 1 ? '' : 's'} · ${waitPlans.length} plan approval${waitPlans.length === 1 ? '' : 's'}</span></div>`);

  const followCard = `<div class="card"><h3>Follow up today</h3>
    ${follow.length ? follow.slice(0, 8).map(c => `<a class="dash-row" href="#/customer/${c.phone}"><span><b>${esc(c.name)}</b><span class="muted" style="font-size:12px;display:block">${esc(c.follow_up.todo || 'No note')}</span></span>
      <span class="${days(c.follow_up.date) < 0 ? 'pct-low' : 'chip warn'}" style="font-size:12px;white-space:nowrap">${days(c.follow_up.date) < 0 ? `${-days(c.follow_up.date)}d overdue` : 'Today'}</span></a>`).join('')
      + (follow.length > 8 ? `<a href="#/customers" class="muted" style="font-size:12.5px">+ ${follow.length - 8} more</a>` : '')
      : '<p class="muted">Nothing to follow up today.</p>'}</div>`;

  const prepaidCard = `<div class="card"><h3>Prepaid packages expiring soon</h3>
    ${expiring.length ? expiring.map(({ c, p, n }) => `<a class="dash-row" href="#/customer/${c.phone}"><span><b>${esc(c.name)}</b><span class="muted" style="font-size:12px;display:block">${esc(p.product)} · ${rm0(p.total_rm - p.used_rm)} left</span></span>
      <span class="${n < 0 ? 'pct-low' : 'chip warn'}" style="font-size:12px;white-space:nowrap">${n < 0 ? 'Expired' : n === 0 ? 'Today' : `${n} days`}</span></a>`).join('')
      : `<p class="muted">None in the next ${warnDays} days.</p>`}</div>`;

  let mgmtCards = '';
  if (role === 'mgmt') {
    mgmtCards = `
    <div class="card"><h3>Payments to confirm</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 8px">Commission and the Google Sheet only count a sale after you confirm it was paid in full.</p>
      ${pending.length ? pending.slice(0, 6).map(s => `<a class="dash-row" href="#/sales/pending"><span><b>${esc(custName(s.phone))}</b><span class="muted" style="font-size:12px;display:block">${s.date} · ${esc(s.product)} · ${esc(D.companies.companies.find(x => x.id === s.company)?.name || s.company)}</span></span><span class="money">${rm0(s.amount_rm)}</span></a>`).join('')
        + `<a class="btn" style="margin-top:10px" href="#/sales/pending">Confirm payments →</a>` : '<p class="muted">All payments confirmed.</p>'}
    </div>
    <div class="card"><h3>Plans waiting for approval</h3>
      ${waitPlans.length ? waitPlans.map(p => `<a class="dash-row" href="#/planner/${p.id}"><span><b>${esc(custName(p.customer_phone))}</b><span class="muted" style="font-size:12px;display:block">${esc(PlannerAPI.pkg(p.package_code)?.name_en || p.package_code)}</span></span><span class="chip warn">Review</span></a>`).join('') : '<p class="muted">No plans waiting.</p>'}
    </div>
    <div class="card"><h3>Agent applications</h3><p class="muted" style="font-size:12.5px">New agents sign up through the Developer's login flow. Applications will show here once it is built. Add agents now on page 13.</p></div>`;
  }

  return `
    <div class="page-head"><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${esc(ctx.user?.name || '')}</h1>
      <p>${new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${ctx.scope === 'own' ? ' · showing your customers and sales' : ''}</p></div>
    <div class="grid c3" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${tiles.join('')}</div>
    <div class="grid c2" style="margin-top:14px;align-items:start">${followCard}${prepaidCard}${mgmtCards}</div>`;
};
