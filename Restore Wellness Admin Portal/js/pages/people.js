/* Page 13 · People & Roles (Management only).
 * Reads + writes: people (data/mock/people.json). Reads: customers (to show who each person looks after).
 * Each change saves straight away, so an account can be switched off the same day someone leaves.
 * DEVELOPER: "active: false" must block login immediately; roles here drive the permissions table in js/core.js.
 */
'use strict';

const PP = { adding: false, showInactive: false };
const PP_ROLES = { mgmt: 'Management', admin: 'Admin', nutritionist: 'Nutritionist', agent: 'Agent' };

Pages.people = ctx => {
  if (ctx.role !== 'mgmt') return '<div class="card">Management only.</div>';
  const el = document.createElement('div');
  const draw = () => { el.innerHTML = ppPage(ctx); };
  el.addEventListener('click', e => ppClick(e, el, ctx, draw));
  el.addEventListener('change', e => ppChange(e, el, ctx, draw));
  draw();
  return el;
};

function ppPage(ctx) {
  const people = Data.raw.people.people, custs = Data.raw.customers.customers;
  const agents = people.filter(p => p.role === 'agent' && p.active);
  const count = p => p.role === 'agent' ? custs.filter(c => c.agent_id === p.id).length : p.role === 'nutritionist' ? custs.filter(c => c.nutritionist_id === p.id).length : null;
  const shown = people.filter(p => PP.showInactive || p.active);
  const groups = Object.entries(PP_ROLES).map(([role, label]) => {
    const list = shown.filter(p => p.role === role);
    if (!list.length) return '';
    return `<tr class="sub"><td colspan="5"><b>${label}</b> <span class="muted">(${list.filter(p => p.active).length} active)</span></td></tr>` + list.map(p => {
      const n = count(p), team = people.filter(x => x.leader_id === p.id && x.active);
      return `<tr style="${p.active ? '' : 'opacity:.55'}">
        <td><b>${esc(p.name)}</b>${p.active ? '' : ` <span class="chip">Inactive since ${esc(p.deactivated || '—')}</span>`}
          <div class="muted" style="font-size:11.5px">${n != null ? `${n} customer${n === 1 ? '' : 's'}` : ''}${team.length ? ` · leads ${team.map(t => esc(t.name)).join(', ')}` : ''}</div></td>
        <td><select class="in" data-k="role" data-id="${p.id}" ${p.active ? '' : 'disabled'}>${Object.entries(PP_ROLES).map(([r, l]) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td>${p.role === 'agent' ? `<label class="field" style="flex-direction:row;align-items:center;gap:6px">Leader
              <select class="in" data-k="leader" data-id="${p.id}" ${p.active ? '' : 'disabled'}><option value="">No leader</option>${agents.filter(a => a.id !== p.id).map(a => `<option value="${a.id}" ${a.id === p.leader_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`
          : p.role === 'nutritionist' ? `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-k="probation" data-id="${p.id}" ${p.probation ? 'checked' : ''} ${p.active ? '' : 'disabled'}> On probation</label>` : ''}</td>
        <td class="r">${p.id === ctx.user.id ? '<span class="muted" style="font-size:12px">You</span>'
          : p.active ? `<button class="btn" data-act="off" data-id="${p.id}">Deactivate</button>` : `<button class="btn" data-act="on" data-id="${p.id}">Reactivate</button>`}</td></tr>`;
    }).join('');
  }).join('');

  return `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
      <div><h1>People & Roles</h1><p>Changes save straight away. Deactivate an account on the day the person leaves.</p></div>
      ${PP.adding ? '' : '<button class="btn primary" data-act="add">+ Add person</button>'}</div>
    ${PP.adding ? `<div class="card" style="margin-bottom:14px"><h3>Add person</h3>
      <div class="toolbar" style="margin:10px 0 0">
        <input class="in grow" id="ppName" placeholder="Name">
        <select class="in" id="ppRole">${Object.entries(PP_ROLES).map(([r, l]) => `<option value="${r}" ${r === 'agent' ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="in" id="ppLeader"><option value="">No leader (agents only)</option>${agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="ppProb" checked> On probation (nutritionists)</label>
        <button class="btn primary" data-act="create">Add</button><button class="btn" data-act="cancel">Cancel</button></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Login details are set up by the Developer once the system goes live.</p></div>` : ''}
    <div class="toolbar"><label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-k="inactive" ${PP.showInactive ? 'checked' : ''}> Show inactive accounts</label></div>
    <div class="card table-wrap" style="padding:6px 8px"><table class="t">
      <tr><th>Person</th><th>Role</th><th>Team / probation</th><th></th></tr>${groups}</table></div>
    <p class="muted" style="font-size:12.5px">Deactivating an agent does not move their customers: customers stay with the agent who brought them in (commission rule). Change a customer's agent on their profile if Management decides otherwise.</p>`;
}

async function ppSave(ctx, msg, draw) {
  try {
    const doc = Data.raw.people;
    await Data.save('people', doc);
    App.refresh(); App.fillUserSel(); toast(msg);
  } catch (e) { toast(e.message); await Data.reload('people'); }
  draw();
}

async function ppChange(e, el, ctx, draw) {
  const t = e.target, k = t.dataset.k;
  if (k === 'inactive') { PP.showInactive = t.checked; draw(); return; }
  const p = Data.raw.people.people.find(x => x.id === t.dataset.id);
  if (!p) return;
  if (k === 'role') {
    const team = Data.raw.people.people.filter(x => x.leader_id === p.id && x.active);
    if (p.role === 'agent' && team.length && !confirm(`${p.name} leads ${team.map(x => x.name).join(', ')}. Changing the role removes them as leader. Continue?`)) { draw(); return; }
    if (p.role === 'agent') Data.raw.people.people.forEach(x => { if (x.leader_id === p.id) x.leader_id = null; });
    p.role = t.value;
    if (p.role === 'agent') p.leader_id ??= null; else delete p.leader_id;
    if (p.role === 'nutritionist') p.probation ??= true; else delete p.probation;
    return ppSave(ctx, `${p.name} is now ${PP_ROLES[p.role]}`, draw);
  }
  if (k === 'leader') { p.leader_id = t.value || null; return ppSave(ctx, 'Leader saved', draw); }
  if (k === 'probation') { p.probation = t.checked; return ppSave(ctx, t.checked ? 'Set to probation' : 'Probation finished', draw); }
}

async function ppClick(e, el, ctx, draw) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const all = Data.raw.people.people, p = all.find(x => x.id === b.dataset.id);
  switch (b.dataset.act) {
    case 'add': PP.adding = true; draw(); el.querySelector('#ppName').focus(); return;
    case 'cancel': PP.adding = false; draw(); return;
    case 'create': {
      const name = el.querySelector('#ppName').value.trim(), role = el.querySelector('#ppRole').value;
      if (!name) return toast('Enter a name');
      if (all.some(x => x.name.toLowerCase() === name.toLowerCase() && x.active)) return toast('Someone with this name is already active');
      const id = 'u-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '') + (all.some(x => x.id === 'u-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '')) ? '-' + Date.now().toString(36).slice(-4) : '');
      const np = { id, name, role, active: true, joined: new Date().toISOString().slice(0, 10) };
      if (role === 'agent') np.leader_id = el.querySelector('#ppLeader').value || null;
      if (role === 'nutritionist') np.probation = el.querySelector('#ppProb').checked;
      all.push(np); PP.adding = false;
      return ppSave(ctx, `${name} added`, draw);
    }
    case 'off': {
      const team = all.filter(x => x.leader_id === p.id && x.active);
      if (!confirm(`Deactivate ${p.name}? They will not be able to log in.${team.length ? `\n\nThey lead ${team.map(x => x.name).join(', ')}. Those agents will keep ${p.name} as leader until you change it.` : ''}`)) return;
      p.active = false; p.deactivated = new Date().toISOString().slice(0, 10);
      return ppSave(ctx, `${p.name} deactivated`, draw);
    }
    case 'on': p.active = true; delete p.deactivated; return ppSave(ctx, `${p.name} reactivated`, draw);
  }
}
