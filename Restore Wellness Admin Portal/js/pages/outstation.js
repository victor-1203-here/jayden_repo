/* Page 6 · Outstation Blood Test (Admin + Management).
 * Reads: centers (innoquest_centers.json), iqForm (innoquest_form.json), customers, costCalc (Innoquest codes). Writes: nothing.
 * lab_pic / lab_email are internal (FIELD_POLICY: Admin + Management only).
 * The filled form PDF is made in the browser with pdf-lib (js/vendor). Developer may move PDF generation to the server.
 */
'use strict';

const OS = { tab: 'branches', state: '', q: '', f: null };
const osBlankF = () => ({ phone: '', name: '', ic: '', dd: '', mm: '', yyyy: '', age: '', sex: 'M', fasting: 'fasting', codes: '' });

function osAge(dd, mm, yyyy) {
  const d = +dd, m = +mm, y = +yyyy;
  if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  const t = new Date(); let age = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age--;
  return age >= 0 && age < 140 ? String(age) : '';
}
/* Malaysian IC 680312-10-5678 → DOB + sex (last digit odd = male) */
function osFromIC(ic) {
  const d = String(ic).replace(/\D/g, '');
  if (d.length !== 12) return null;
  const yy = +d.slice(0, 2), now = new Date().getFullYear() % 100;
  return { yyyy: String(yy > now ? 1900 + yy : 2000 + yy), mm: d.slice(2, 4), dd: d.slice(4, 6), sex: +d[11] % 2 ? 'M' : 'F' };
}
function osWrap(s, w) {
  const words = String(s).split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const wd of words) { if (cur && (cur + ' ' + wd).length > w) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; }
  if (cur) lines.push(cur);
  return lines;
}

Pages.outstation = ctx => {
  if (!OS.f) OS.f = osBlankF();
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head"><h1>Outstation Blood Test</h1><p>Find the nearest Innoquest branch for the customer, then fill the Innoquest request form.</p></div>
    <div class="tabs"><button data-tab="branches">Branches</button><button data-tab="form">Innoquest form</button></div>
    <div id="osBody"></div>`;
  const draw = () => {
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === OS.tab));
    el.querySelector('#osBody').innerHTML = OS.tab === 'branches' ? osBranches(ctx) : osForm(ctx);
  };
  el.addEventListener('click', e => osClick(e, el, ctx, draw));
  el.addEventListener('input', e => osInput(e, el, ctx, draw));
  el.addEventListener('change', e => osInput(e, el, ctx, draw, true));
  draw();
  return el;
};

/* ---------------- branches ---------------- */
function osBranches(ctx) {
  const all = ctx.data.centers.innoquest_centers;
  const states = [...new Set(all.map(c => c.state))].sort();
  const q = OS.q.trim().toLowerCase();
  const list = all.filter(c => (!OS.state || c.state === OS.state) && (!q || (c.branch + ' ' + c.address).toLowerCase().includes(q)));
  return `
    <div class="toolbar">
      <select class="in" data-k="state"><option value="">All states (${all.length})</option>${states.map(s => `<option ${s === OS.state ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <input class="in grow" type="search" data-k="q" placeholder="Search town, branch or postcode" value="${esc(OS.q)}">
    </div>
    <div class="grid c2" id="osCards">${list.map((c, i) => osCard(c, all.indexOf(c))).join('') || '<p class="muted">No branch found.</p>'}</div>`;
}
function osCard(c, i) {
  const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Innoquest ' + c.address);
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h3>${esc(c.branch)}</h3><span class="chip">${esc(c.type || '')}</span></div>
    <div class="muted" style="font-size:12.5px;margin-bottom:8px">${esc(c.state)}</div>
    <dl class="kv"><dt>Address</dt><dd>${esc(c.address)}</dd><dt>Hours</dt><dd>${esc(c.hours)}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd></dl>
    <div class="toolbar" style="margin:12px 0 0"><button class="btn primary" data-copy-branch="${i}">Copy for customer</button><a class="btn" href="${maps}" target="_blank" rel="noopener">Map ↗</a></div>
    ${'lab_pic' in c || 'lab_email' in c ? `<div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:7px;font-size:12.5px">
      <span class="mgmt-label" style="color:var(--muted)">Internal · do not send to customer</span>
      <dl class="kv" style="margin-top:4px"><dt>Lab PIC</dt><dd>${esc(c.lab_pic || '—')}</dd><dt>Lab email</dt><dd>${c.lab_email ? `<a href="mailto:${esc(c.lab_email)}">${esc(c.lab_email)}</a>` : '—'}</dd></dl></div>` : ''}
  </div>`;
}
function osCustomerText(c) {
  return `Innoquest ${c.branch}\n地址：${c.address}\n营业时间：${c.hours}\n电话：${c.phone || '-'}\nGoogle Maps：https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Innoquest ' + c.address)}\n\n验血前请空腹 8–10 小时（可以喝白开水），记得带 IC。`;
}

/* ---------------- form ---------------- */
function osForm(ctx) {
  const f = OS.f, custs = ctx.data.customers.customers;
  const tests = ctx.data.costCalc.master_tests.filter(t => t.innoquest_code);
  const codes = f.codes.split(/[,\s]+/).filter(Boolean);
  return `
    <div class="grid c2" style="align-items:start">
      <div class="card"><h3>1 · Customer</h3>
        <label class="field" style="margin-top:10px">Load from customer list (optional)
          <select class="in" data-k="cust"><option value="">— Type details below —</option>${custs.map(c => `<option value="${c.phone}" ${c.phone === f.phone ? 'selected' : ''}>${esc(c.name)} · ${fmtPhone(c.phone)}</option>`).join('')}</select></label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <label class="field" style="grid-column:1/-1">Name (block letters) *<input class="in" data-k="f" data-f="name" value="${esc(f.name)}" placeholder="e.g. TAN MEI LING"></label>
          <label class="field" style="grid-column:1/-1">IC / Passport no. *<input class="in" data-k="f" data-f="ic" value="${esc(f.ic)}" placeholder="e.g. 680312-10-5678 (fills DOB and sex)"></label>
          <div class="field" style="grid-column:1/-1">Date of birth *
            <div style="display:flex;gap:6px"><input class="in" style="width:56px" maxlength="2" inputmode="numeric" placeholder="DD" data-k="f" data-f="dd" value="${esc(f.dd)}">
              <input class="in" style="width:56px" maxlength="2" inputmode="numeric" placeholder="MM" data-k="f" data-f="mm" value="${esc(f.mm)}">
              <input class="in" style="width:76px" maxlength="4" inputmode="numeric" placeholder="YYYY" data-k="f" data-f="yyyy" value="${esc(f.yyyy)}"></div></div>
          <label class="field">Age *<input class="in" style="width:70px" data-k="f" data-f="age" value="${esc(f.age)}" placeholder="auto"></label>
          <div class="field">Sex *<div class="seg">${['M', 'F'].map(s => `<button class="btn ${f.sex === s ? 'primary' : ''}" data-sex="${s}">${s === 'M' ? 'Male' : 'Female'}</button>`).join('')}</div></div>
          <div class="field" style="grid-column:1/-1">Specimen *<div class="seg">${[['fasting', 'Fasting'], ['non_fasting', 'Non-fasting']].map(([v, l]) => `<button class="btn ${f.fasting === v ? 'primary' : ''}" data-fast="${v}">${l}</button>`).join('')}</div></div>
        </div>
      </div>
      <div class="card"><h3>2 · Test codes</h3>
        <p class="muted" style="font-size:12.5px;margin:6px 0 10px">Paste the Innoquest codes from Amanda's blood test tool (page 4), or add tests below.</p>
        <textarea class="in" rows="4" style="width:100%;font-family:var(--mono);font-size:12.5px" data-k="f" data-f="codes" placeholder="IQMY1, HOX, OXD, ACO …">${esc(f.codes)}</textarea>
        <div class="toolbar" style="margin:8px 0 0">
          <select class="in grow" data-k="addtest"><option value="">+ Add a test…</option>${tests.map(t => `<option value="${esc(t.innoquest_code)}" ${codes.includes(t.innoquest_code) ? 'disabled' : ''}>${esc(t.name)} · ${esc(t.innoquest_code)}</option>`).join('')}</select>
          <span class="muted" style="font-size:12.5px">${codes.length} code${codes.length === 1 ? '' : 's'}</span></div>
        <div class="notice" style="margin-top:12px;font-size:12.5px">Doctor code <b>VRDU21</b> and Bill to <b>VRLF2</b> are already printed on the form.</div>
        <button class="btn primary" style="margin-top:14px;width:100%" data-act="pdf">Download filled form (PDF)</button>
        <p id="osMsg" class="muted" style="font-size:12.5px;margin:8px 0 0"></p>
      </div>
    </div>`;
}

function osInput(e, el, ctx, draw, isChange) {
  const t = e.target, k = t.dataset.k, f = OS.f;
  if (!k) return;
  if (k === 'state' && isChange) { OS.state = t.value; draw(); return; }
  if (k === 'q' && !isChange) { OS.q = t.value; const cards = el.querySelector('#osCards'); const tmp = document.createElement('div'); tmp.innerHTML = osBranches(ctx); cards.innerHTML = tmp.querySelector('#osCards').innerHTML; return; }
  if (k === 'cust' && isChange) {
    const c = ctx.data.customers.customers.find(x => x.phone === t.value);
    Object.assign(f, osBlankF(), { codes: f.codes, fasting: f.fasting });
    if (c) {
      f.phone = c.phone; f.name = c.name.toUpperCase(); f.ic = c.ic || ''; f.sex = c.gender === 'F' ? 'F' : 'M';
      if (c.dob) [f.yyyy, f.mm, f.dd] = c.dob.split('-');
      if (f.ic) Object.assign(f, osFromIC(f.ic) || {});
      f.age = osAge(f.dd, f.mm, f.yyyy);
    }
    draw(); return;
  }
  if (k === 'addtest' && isChange) { if (t.value) f.codes = [...f.codes.split(/[,\s]+/).filter(Boolean), t.value].join(', '); draw(); return; }
  if (k === 'f' && !isChange) {
    let v = t.value;
    if (t.dataset.f === 'name') { v = v.toUpperCase(); const p = t.selectionStart; t.value = v; t.setSelectionRange(p, p); }
    f[t.dataset.f] = v;
    if (t.dataset.f === 'ic') { const g = osFromIC(v); if (g) { Object.assign(f, g); f.age = osAge(f.dd, f.mm, f.yyyy); ['dd', 'mm', 'yyyy', 'age'].forEach(x => { const i = el.querySelector(`[data-f="${x}"]`); if (i) i.value = f[x]; }); el.querySelectorAll('[data-sex]').forEach(b => b.classList.toggle('primary', b.dataset.sex === f.sex)); } }
    if (['dd', 'mm', 'yyyy'].includes(t.dataset.f)) { const a = osAge(f.dd, f.mm, f.yyyy); if (a) { f.age = a; el.querySelector('[data-f="age"]').value = a; } }
  }
}

async function osClick(e, el, ctx, draw) {
  const tab = e.target.closest('[data-tab]');
  if (tab) { OS.tab = tab.dataset.tab; draw(); return; }
  const cb = e.target.closest('[data-copy-branch]');
  if (cb) {
    const txt = osCustomerText(ctx.data.centers.innoquest_centers[+cb.dataset.copyBranch]);
    try { await navigator.clipboard.writeText(txt); toast('Copied — paste it to the customer'); } catch { toast('Could not copy'); }
    return;
  }
  const sx = e.target.closest('[data-sex]'); if (sx) { OS.f.sex = sx.dataset.sex; draw(); return; }
  const fs = e.target.closest('[data-fast]'); if (fs) { OS.f.fasting = fs.dataset.fast; draw(); return; }
  if (e.target.closest('[data-act="pdf"]')) osPdf(el, ctx);
}

async function osPdf(el, ctx) {
  const f = OS.f, msg = el.querySelector('#osMsg');
  const fail = t => { msg.style.color = 'var(--danger)'; msg.textContent = t; };
  const need = [['name', 'name'], ['ic', 'IC / passport no.'], ['dd', 'date of birth'], ['mm', 'date of birth'], ['yyyy', 'date of birth'], ['age', 'age'], ['codes', 'test codes']].filter(([k]) => !String(f[k]).trim());
  if (need.length) return fail('Please fill in: ' + [...new Set(need.map(n => n[1]))].join(', '));
  if (!window.PDFLib) return fail('PDF engine did not load.');
  try {
    msg.style.color = ''; msg.textContent = 'Making the PDF…';
    const F = ctx.data.iqForm, { PDFDocument, StandardFonts, rgb } = PDFLib;
    const bytes = await fetch(F.blank_pdf).then(r => { if (!r.ok) throw new Error('Blank form not found'); return r.arrayBuffer(); });
    const doc = await PDFDocument.load(bytes), page = doc.getPages()[0];
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const H = F.page_height, black = rgb(0, 0, 0);
    const put = ([x, y], txt, size = F.font_size) => { if (txt) page.drawText(String(txt), { x, y: H - y, size, font, color: black }); };
    put(F.fields.name, f.name.trim().toUpperCase()); put(F.fields.ic, f.ic.trim());
    put(F.fields.dob_dd, f.dd.padStart(2, '0')); put(F.fields.dob_mm, f.mm.padStart(2, '0')); put(F.fields.dob_yyyy, f.yyyy);
    put(F.fields.age, f.age); put(F.fields.sex, f.sex);
    const [cx, cy] = F.checkboxes[f.fasting], h = F.checkbox_mark_half;
    page.drawLine({ start: { x: cx - h, y: H - cy - h }, end: { x: cx + h, y: H - cy + h }, thickness: 1.4, color: black });
    page.drawLine({ start: { x: cx - h, y: H - cy + h }, end: { x: cx + h, y: H - cy - h }, thickness: 1.4, color: black });
    const C = F.codes, codes = f.codes.split(/[,\s]+/).filter(Boolean).join(', ');
    osWrap(codes, C.wrap_chars).forEach((ln, i) => put([C.start[0], C.start[1] + i * C.line_height], ln, C.font_size));
    const blob = new Blob([await doc.save()], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Innoquest Form - ' + f.name.replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    msg.style.color = 'var(--accent)'; msg.textContent = 'Done. The PDF is in your Downloads folder.';
    OS.lastPdf = blob;   // kept for testing
  } catch (err) { fail('Error: ' + err.message); }
}
