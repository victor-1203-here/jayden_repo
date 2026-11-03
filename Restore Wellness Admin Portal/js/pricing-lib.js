/* Shared price / cost calculations. Used by page 12 (settings), 5 (price lookup) and 9 (CLINICAL planner).
 * Every function works on a data object `d` shaped like App.data. For non-Management roles the cost
 * fields are already removed, so cost results come back as null — never guess a cost.
 */
'use strict';

const Pricing = {
  num(v) { return typeof v === 'number' && isFinite(v) ? v : null; },

  /* ---------- lab tests (cost_calc_data.json) ---------- */
  labTest(d, name) { return d.costCalc.master_tests.find(t => t.name === name) || null; },
  labCostHigh(t) {
    const c = [t?.eurofins_cost, t?.innoquest_cost].filter(v => typeof v === 'number');
    return c.length ? Math.max(...c) : null;
  },
  labCostLow(t) {
    const c = [t?.eurofins_cost, t?.innoquest_cost].filter(v => typeof v === 'number');
    return c.length ? Math.min(...c) : null;
  },

  /* ---------- blood markers: cost = sum of lab tests at the higher lab cost ---------- */
  markerCost(d, m) {
    if (!m?.lab_tests?.length) return null;
    let sum = 0;
    for (const name of m.lab_tests) {
      const c = this.labCostHigh(this.labTest(d, name));
      if (c == null) return null;
      sum += c;
    }
    return Math.round(sum * 100) / 100;
  },
  marker(d, code) { return d.packages.blood_markers.find(m => m.code === code) || null; },
  /* one blood test made of a marker selection (required markers always included) */
  bloodUnit(d, codes) {
    let price = 0, cost = 0;
    for (const m of d.packages.blood_markers) {
      if (!(m.required || codes.includes(m.code))) continue;
      price += m.price || 0;
      const c = this.markerCost(d, m);
      cost = cost == null || c == null ? null : cost + c;
    }
    return { price, cost };
  },

  /* ---------- treatment items (restore_packages.json) ---------- */
  item(d, code) { return d.packages.items.find(i => i.code === code) || null; },
  itemUnit(d, code, markerCodes) {
    if (code === 'blood_test') return this.bloodUnit(d, markerCodes || []);
    const it = this.item(d, code);
    return { price: it?.price ?? null, cost: this.num(it?.cost) };
  },

  /* ---------- cost assumptions ---------- */
  perMinute(a) { return a.nutritionist_daily_wage / (a.consults_per_day * 60); },
  trackingCost(a) {
    return a.tracking_platform_per_user + a.tracking_platform_fixed_monthly / a.tracking_active_users
      + a.weeks_per_month * a.tracking_review_minutes_per_week * this.perMinute(a);
  },
  derivedCosts(a) {
    const out = {};
    for (const [code, rule] of Object.entries(a.derived_costs || {})) {
      out[code] = rule.formula === 'tracking' ? this.trackingCost(a) : rule.minutes * this.perMinute(a);
      out[code] = Math.round(out[code] * 100) / 100;
    }
    return out;
  },

  /* ---------- package economics (Management only) ---------- */
  packageEcon(d, pkg, withLeader) {
    const P = d.packages, price = pkg.price_incl_sst;
    const net = price / (1 + P.sst_rate);
    const commission = pkg.agent_commission_rm ?? 0;
    const override = withLeader ? net * (P.commission_rules?.leader_override?.rate ?? 0) : 0;
    const fee = price * (P.payment_fee_rate_default ?? 0);
    const available = net - commission - override - fee;
    const lock = available * (pkg.lock_pct ?? 0);
    return { price, net, commission, override, fee, available, lock, budget: available - lock, valueTarget: price * (pkg.value_multiple ?? 0) };
  },
  /* cost + value of a list of {item, qty} */
  planTotals(d, rows, markerCodes) {
    let cost = 0, value = 0;
    for (const r of rows) {
      const u = this.itemUnit(d, r.item, markerCodes);
      const q = r.qty ?? r.min_qty ?? 0;
      value += (u.price || 0) * q;
      cost = cost == null || u.cost == null ? null : cost + u.cost * q;
    }
    return { cost, value };
  },

  /* ---------- fixed blood test packages (cost_calc_data.json) ---------- */
  fixedPackageCost(d, key) {
    const fp = d.costCalc.fixed_packages?.[key];
    if (!fp) return null;
    let sum = 0;
    for (const raw of fp.items) {
      const name = raw.replace(/ \(Only (Male|Female)\)$/, '');
      const t = this.labTest(d, name) || (name.startsWith('CRP,') ? this.labTest(d, 'Hs' + name) : null);
      const c = this.labCostLow(t);
      if (c == null) return null;
      sum += c;
    }
    return sum;
  },

  /* ---------- sales catalog row (products.json) -> resolved price/cost ---------- */
  product(d, p) {
    const s = p.source;
    if (!s) return { price: p.price ?? null, cost: this.num(p.cost), unit: '', editPrice: true, editCost: true, from: null };
    if (s.type === 'item') {
      const it = this.item(d, s.code);
      return { price: it?.price ?? null, cost: this.num(it?.cost), unit: it?.unit || '', editPrice: true, editCost: true, from: 'Treatment item' };
    }
    if (s.type === 'marker') {
      const m = this.marker(d, s.code);
      return { price: m?.price ?? null, cost: this.markerCost(d, m), unit: '次', editPrice: true, editCost: false, from: 'Blood marker' };
    }
    if (s.type === 'package') {
      const pk = d.packages.packages.find(x => x.code === s.code);
      return { price: pk?.price_incl_sst ?? null, cost: null, unit: '', editPrice: true, editCost: false, from: 'Package', costNote: 'See page 12 › Packages' };
    }
    if (s.type === 'fixed_package') {
      const fp = d.costCalc.fixed_packages?.[s.code];
      return { price: fp?.price ?? null, cost: this.fixedPackageCost(d, s.code), unit: '', editPrice: true, editCost: false, from: 'Fixed blood package' };
    }
    return { price: null, cost: null, unit: '', editPrice: false, editCost: false, from: s.type };
  },
  /* write a price / cost edit back to wherever the row's value lives */
  setProduct(d, p, field, value) {
    const s = p.source;
    if (!s) { p[field] = value; return 'products'; }
    if (s.type === 'item') { this.item(d, s.code)[field] = value; return 'packages'; }
    if (s.type === 'marker' && field === 'price') { this.marker(d, s.code).price = value; return 'packages'; }
    if (s.type === 'package' && field === 'price') { d.packages.packages.find(x => x.code === s.code).price_incl_sst = value; return 'packages'; }
    if (s.type === 'fixed_package' && field === 'price') { d.costCalc.fixed_packages[s.code].price = value; return 'costCalc'; }
    return null;
  },

  margin(price, cost) { return price > 0 && cost != null ? (price - cost) / price : null; },
  suggested(cost) { return cost != null && cost > 0 ? Math.round(cost / 0.4) : null; },
};
