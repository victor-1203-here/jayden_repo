/* CLINICAL planner — "server" side.
 *
 * DEVELOPER: everything in this file belongs on the server. In this front-end build it runs in the
 * browser on Data.raw (the unfiltered files) to imitate the API. Production endpoints:
 *   POST /api/plans/evaluate   body: plan            → evaluate(plan, role)
 *   POST /api/plans/save       body: plan + action   → save(plan, action, role)
 * The nutritionist response must never contain cost, budget RM, net, commission, fee, lock or profit:
 * evaluate() already returns only percentages and selling prices for that role.
 */
'use strict';

const PlannerAPI = {
  d() { return Data.raw; },
  pkg(code) { return this.d().packages.packages.find(p => p.code === code); },
  customer(phone) { return this.d().customers.customers.find(c => c.phone === phone); },

  /* leader override applies when the customer's agent was recruited by a leader */
  leaderApplies(plan) {
    const c = this.customer(plan.customer_phone);
    const agent = c?.agent_id && this.d().people.people.find(p => p.id === c.agent_id);
    return !!agent?.leader_id;
  },

  /* unit price + cost of every item: from the snapshot once submitted, else the live price list */
  unit(plan, code, snap) {
    if (snap?.items?.[code]) return { price: snap.items[code].price, cost: snap.items[code].unit_cost ?? null };
    return Pricing.itemUnit(this.d(), code, plan.markers);
  },
  /* the server's own copy of the snapshot (the browser copy may have costs stripped) */
  storedSnapshot(plan) {
    if (!plan.snapshot) return null;
    return this.d().plans.plans.find(x => x.id === plan.id)?.snapshot || plan.snapshot;
  },

  evaluate(plan, role) {
    const D = this.d(), pk = this.pkg(plan.package_code), mgmt = role === 'mgmt';
    const snap = this.storedSnapshot(plan);
    const price = snap?.package_price ?? pk.price_incl_sst;
    const leader = snap ? snap.leader_override : this.leaderApplies(plan);
    const econ = snap?.econ ?? Pricing.packageEcon(D, { ...pk, price_incl_sst: price }, leader);
    const poster = Object.fromEntries((pk.included_items || []).map(r => [r.item, r.min_qty ?? r.qty ?? 0]));

    let value = 0, cost = 0, posterCost = 0;
    const rows = Object.entries(plan.qty).filter(([, q]) => q > 0).map(([item, qty]) => {
      const u = this.unit(plan, item, snap);
      value += (u.price || 0) * qty;
      cost += (u.cost || 0) * qty;
      posterCost += (u.cost || 0) * Math.min(qty, poster[item] || 0);
      const row = { item, qty, poster_qty: poster[item] || 0, price: u.price, value: (u.price || 0) * qty };
      if (mgmt) { row.unit_cost = u.cost; row.cost = (u.cost || 0) * qty; }
      return row;
    });

    const blood = this.unit(plan, 'blood_test', snap);
    const cap = D.packages.blood_marker_cap_per_test;
    const valueTarget = price * pk.value_multiple;
    const usedPct = econ.budget > 0 ? cost / econ.budget : 1;
    const out = {
      package_price: price, rows, value, valueTarget, valueShort: Math.max(0, valueTarget - value),
      usedPct, posterPct: econ.budget > 0 ? posterCost / econ.budget : 0,
      overBudget: usedPct > 1.00001,
      blood: { price: blood.price, cap, overCap: blood.price > cap },
      leader_override: leader,
    };
    out.needsApproval = out.overBudget || out.blood.overCap;
    if (mgmt) Object.assign(out, { cost, econ, profit: econ.available - cost, profitPctNet: (econ.available - cost) / econ.net, bloodCost: blood.cost });
    return out;
  },

  snapshot(plan) {
    const D = this.d(), pk = this.pkg(plan.package_code), leader = this.leaderApplies(plan);
    const items = {};
    for (const code of Object.keys(plan.qty)) {
      const u = Pricing.itemUnit(D, code, plan.markers);
      items[code] = { price: u.price, unit_cost: u.cost };
    }
    return {
      price_version: D.packages._version, taken: new Date().toISOString().slice(0, 10),
      package_price: pk.price_incl_sst, leader_override: leader,
      econ: Pricing.packageEcon(D, pk, leader), items,
    };
  },

  /* action: 'draft' | 'submit' | 'approve' | 'reject' | 'reopen' | 'usage' */
  async save(plan, action, role, user, note) {
    const p = clone(plan), now = new Date().toISOString().slice(0, 10);
    if (action === 'submit') {
      p.snapshot = this.snapshot(p);
      const ev = this.evaluate(p, 'mgmt');
      p.status = ev.needsApproval ? 'needs_approval' : 'submitted';
      p.submitted = now;
    } else if (action === 'approve' || action === 'reject') {
      if (role !== 'mgmt') throw new Error('Only Management can approve');
      p.status = action === 'approve' ? 'approved' : 'rejected';
      p.decision = { by: user.id, date: now, note: note || '' };
      if (action === 'reject') delete p.snapshot;
    } else if (action === 'reopen') {
      if ((p.usage || []).length) throw new Error('Sessions already recorded — this plan cannot go back to draft');
      p.status = 'draft'; delete p.snapshot;
    } else if (action === 'draft') {
      p.status = 'draft';
    }
    p.updated = now;
    // the browser copy for a nutritionist has no costs; the stored copy keeps the server snapshot
    const stored = this.d().plans.plans.find(x => x.id === p.id);
    if (stored?.snapshot && p.snapshot && action !== 'submit') p.snapshot = stored.snapshot;
    const res = await fetch('/api/plans/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).catch(() => null);
    if (!res?.ok) throw new Error('Could not save. Open the portal with “Start Restore Portal.bat”.');
    await Data.reload('plans');
    App.refresh();
    return p;
  },
};
