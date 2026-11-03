/* Sales — "server" side (discount check, SMART upgrade credit, save).
 *
 * DEVELOPER: production endpoints
 *   POST /api/sales/check   {product_id, amount, customer, role} → {ok, reason, listPrice, upgrade}
 *   POST /api/sales/save    {action, sale}
 * The check must run on the server (it uses cost). Non-Management roles only get ok / "discount too low",
 * never the margin. Management gets the margin number too.
 *
 * Discount rules (docs/00_页面清单 rule 4, page 4): whole-sale margin must stay ≥ discount_margin_floor;
 * items with discount_allowed = false (IV drips, TCM, packages) cannot be discounted; agents cannot discount.
 */
'use strict';

const SalesAPI = {
  d() { return Data.raw; },
  product(id) { return this.d().products.products.find(p => p.id === id); },

  /* list price for this customer: CLINICAL bought within the window after SMART = price − SMART paid */
  priceFor(productId, phone, useUpgrade) {
    const p = this.product(productId), r = Pricing.product(this.d(), p);
    const up = useUpgrade ? this.upgradeOption(productId, phone) : null;
    return { list: up ? up.toPay : r.price, cost: r.cost, upgrade: up };
  },

  upgradeOption(productId, phone) {
    const P = this.d().packages, p = this.product(productId);
    if (p?.source?.type !== 'package') return null;
    const target = P.packages.find(x => x.code === p.source.code);
    if (target.line !== 'CLINICAL') return null;
    const win = P.commission_rules.upgrade.window_days, today = new Date();
    const smart = this.d().sales.sales
      .filter(s => s.phone === phone && s.package_code?.startsWith('SMART') && !this.d().sales.sales.some(x => x.upgrade_from === s.id))
      .filter(s => (today - new Date(s.date + 'T00:00:00')) / 86400000 <= win)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!smart) return null;
    const left = win - Math.floor((today - new Date(smart.date + 'T00:00:00')) / 86400000);
    return { from: smart.id, fromCode: smart.package_code, fromDate: smart.date, credit: smart.amount_rm, toPay: target.price_incl_sst - smart.amount_rm, target: target.code, daysLeft: left };
  },

  check(productId, amount, phone, useUpgrade, role) {
    const p = this.product(productId);
    if (!p) return { ok: false, reason: 'Choose a product' };
    const { list, cost } = this.priceFor(productId, phone, useUpgrade);
    if (list == null) return amount > 0 ? { ok: true, listPrice: null } : { ok: false, reason: 'Enter the amount received' };
    if (!(amount > 0)) return { ok: false, reason: 'Enter the amount received' };
    if (amount >= list - 0.005) return { ok: true, listPrice: list };
    // below list price = a discount
    if (role === 'agent') return { ok: false, reason: 'Agents cannot give discounts. Charge the list price.', listPrice: list };
    if (!p.discount_allowed || p.source?.type === 'package') return { ok: false, reason: 'This item cannot be discounted.', listPrice: list };
    if (cost == null) return { ok: true, listPrice: list, warn: role === 'mgmt' ? 'Cost not set for this item, margin not checked.' : null };
    const margin = (amount - cost) / amount, floor = this.d().settings.discount_margin_floor;
    if (margin < floor) return { ok: false, reason: role === 'mgmt' ? `Margin ${(margin * 100).toFixed(0)}% is under the ${(floor * 100).toFixed(0)}% floor.` : 'This discount is too low.', listPrice: list };
    return { ok: true, listPrice: list, discount: true, margin: role === 'mgmt' ? margin : undefined };
  },

  async save(action, sale, by) {
    const res = await fetch('/api/sales/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, sale, by }) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !out.ok) throw new Error(out.error || 'Could not save. Open the portal with “Start Restore Portal.bat”.');
    await Data.reload('sales'); await Data.reload('customers'); App.refresh();
  },
};
