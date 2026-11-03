/* Agent commission — "server" side.
 *
 * DEVELOPER: runs on Data.raw here to imitate the API. Production endpoint:
 *   GET /api/commission?agent=<id>&from=YYYY-MM&to=YYYY-MM  → lines + rate table for THAT agent only.
 * The response has commission amounts and rates only — never cost, margin or other agents' amounts.
 *
 * Rules (docs/Restore_Packages_Master.md §5 + data/commission_rates.json):
 * - Package: fixed RM per package to the CUSTOMER'S agent (customer stays with the original agent).
 * - SMART → CLINICAL upgrade within the window: agent gets CLINICAL − SMART commission (no double pay).
 * - Leader override: the agent's leader gets 2% of the package net (price / 1.08); upgrade = difference.
 * - Non-package: % of net. Agent's own sale = full rate. Another person sells to the agent's customer later:
 *   blood tests = full rate, other items = repeat_purchase.other_pct.
 * - Counts as "confirmed" only when Management has confirmed full payment (sale.status = confirmed).
 */
'use strict';

const CommissionAPI = {
  d() { return Data.raw; },
  person(id) { return this.d().people.people.find(p => p.id === id); },
  sale(id) { return this.d().sales.sales.find(s => s.id === id); },
  pkg(code) { return this.d().packages.packages.find(p => p.code === code); },
  customerAgent(phone) { return this.d().customers.customers.find(c => c.phone === phone)?.agent_id || null; },
  net(amount, category) {
    const R = this.d().commissionRates, sst = this.d().packages.sst_rate;
    return R.sst_categories.includes(category) ? amount / (1 + sst) : amount;
  },
  pctFor(sale) {
    const R = this.d().commissionRates;
    return R.agent_pct_by_product[sale.product_id] ?? R.agent_pct_by_category[sale.category] ?? 0;
  },

  /* every commission credit from one sale: [{agent, kind, rate, amount}] */
  credits(sale) {
    const P = this.d().packages, R = this.d().commissionRates, out = [];
    const owner = this.customerAgent(sale.phone) || sale.agent_id;
    const add = (agent, kind, rate, amount, extra = {}) => { if (agent && amount > 0.004) out.push({ agent, kind, rate, amount: Math.round(amount * 100) / 100, ...extra }); };
    const leaderOf = a => this.person(a)?.leader_id || null;
    const ovr = P.commission_rules.leader_override.rate;

    if (sale.package_code) {
      const pk = this.pkg(sale.package_code);
      let comm = pk.agent_commission_rm, override = (pk.price_incl_sst / (1 + P.sst_rate)) * ovr, kind = 'Package commission';
      const prev = sale.upgrade_from && this.sale(sale.upgrade_from);
      if (prev?.package_code) {
        const days = (new Date(sale.date) - new Date(prev.date)) / 86400000;
        if (days <= P.commission_rules.upgrade.window_days) {
          const pp = this.pkg(prev.package_code);
          comm -= pp.agent_commission_rm;
          override -= (pp.price_incl_sst / (1 + P.sst_rate)) * ovr;
          kind = `Upgrade from ${pp.code} (difference only)`;
        }
      }
      add(owner, kind, null, comm, { fixed: true });
      add(leaderOf(owner), 'Leader override', ovr * 100, override, { from: owner });
      return out;
    }

    const net = this.net(sale.amount_rm, sale.category), pct = this.pctFor(sale);
    if (sale.agent_id) {
      add(sale.agent_id, 'Your sale', pct, net * pct / 100);
      add(leaderOf(sale.agent_id), 'Leader override', R.leader_override_pct_non_package, net * R.leader_override_pct_non_package / 100, { from: sale.agent_id });
    } else if (owner) {
      const blood = sale.category === 'Blood Test' && R.repeat_purchase.blood_test_full_rate;
      const rate = blood ? pct : R.repeat_purchase.other_pct;
      add(owner, 'Your customer bought more', rate, net * rate / 100);
      if (blood) add(leaderOf(owner), 'Leader override', R.leader_override_pct_non_package, net * R.leader_override_pct_non_package / 100, { from: owner });
    }
    return out;
  },

  /* lines for one agent (what the agent is allowed to receive) */
  linesFor(agentId) {
    const D = this.d(), lines = [];
    for (const s of D.sales.sales) {
      for (const c of this.credits(s)) {
        if (c.agent !== agentId) continue;
        const viaTeam = c.from && c.from !== agentId;
        const cust = D.customers.customers.find(x => x.phone === s.phone);
        lines.push({
          sale_id: s.id, date: s.date, month: s.date.slice(0, 7), product: s.product,
          company: D.companies.companies.find(x => x.id === s.company)?.name || s.company,
          customer: viaTeam ? `${this.person(c.from)?.name}'s customer` : cust?.name || '—',
          kind: viaTeam ? `Leader override (${this.person(c.from)?.name})` : c.kind,
          rate: c.fixed ? 'Fixed' : `${c.rate}%`, amount: c.amount,
          status: s.status === 'confirmed' ? 'confirmed' : 'pending',
        });
      }
    }
    return lines.sort((a, b) => b.date.localeCompare(a.date));
  },

  rateTable(agentId) {
    const D = this.d(), R = D.commissionRates;
    const team = D.people.people.filter(p => p.role === 'agent' && p.leader_id === agentId);
    return {
      packages: D.packages.packages.map(p => ({ name: p.name_en, rm: p.agent_commission_rm })),
      categories: Object.entries(R.agent_pct_by_category).map(([cat, pct]) => ({ cat, pct })),
      products: Object.entries(R.agent_pct_by_product).map(([id, pct]) => ({ name: D.products.products.find(p => p.id === id)?.name || id, pct })),
      repeatOther: R.repeat_purchase.other_pct,
      leaderPct: D.packages.commission_rules.leader_override.rate * 100,
      team: team.map(t => ({ name: t.name, active: t.active })),
      windowDays: D.packages.commission_rules.upgrade.window_days,
    };
  },
};
