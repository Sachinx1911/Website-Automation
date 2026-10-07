/* CurrentFlow — Approved Articles: everything that passed review and is on its way to WordPress */

const AP_STAGES = ['approved', 'scheduled', 'changes'];
const AP_TABS = [['all', 'All'], ['ready', 'Ready to Publish'], ['scheduled', 'Scheduled'], ['changes', 'Pending Changes'], ['failed', 'Failed']];
const AP_FILTERS = ['apQ', 'apCat', 'apSrc', 'apStatus', 'apFrom', 'apTo'];
const apFailed = a => !!a.publish_error && a.status !== 'published';
// "draft" also means "Claude just wrote it and auto-saved a WordPress draft" (not reviewed yet),
// so a draft belongs here only if it was approved at some point
const apIn = a => AP_STAGES.includes(a.status) || (a.status === 'draft' && !!a.approved_at) || apFailed(a);
const apReadyCount = () => S.articles.filter(a => apIn(a) && apGroup(a) === 'ready').length;
const apGroup = a => apFailed(a) ? 'failed' : a.status === 'scheduled' ? 'scheduled' : a.status === 'changes' ? 'changes' : 'ready';
const apWhen = a => a.approved_at || a.finished || a.updated || '';
const apStatusLabel = a => ({ failed: 'Failed', scheduled: 'Scheduled', changes: 'Pending Changes', ready: a.status === 'draft' ? 'Ready to Publish (WordPress draft)' : 'Ready to Publish' })[apGroup(a)];
const apLocalNow = (ms = 0) => new Date(Date.now() + ms - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

function apBadge(a) {
  const [cls, label] = { failed: ['b-failed', 'Failed'], scheduled: ['b-scheduled', 'Scheduled'], changes: ['b-pending', 'Pending Changes'], ready: ['b-readypub', 'Ready to Publish'] }[apGroup(a)];
  return `<span class="badge ${cls}" ${apFailed(a) ? `title="${esc(a.publish_error)}"` : ''}><span class="bd"></span>${label}</span>`;
}
const apStatus = a => apBadge(a) + (a.status === 'scheduled' && !apFailed(a) ? `<div class="row-meta">${fmtDT(a.scheduled_for)}</div>` : a.status === 'draft' && !apFailed(a) ? '<div class="row-meta">Draft on WordPress</div>' : '');

function apFiltered() {
  const u = S.ui;
  return S.articles.filter(apIn).filter(a =>
    (u.apTab === 'all' || apGroup(a) === u.apTab) && (!u.apStatus || apGroup(a) === u.apStatus) &&
    (!u.apQ || a.title.toLowerCase().includes(u.apQ) || (a.excerpt || '').toLowerCase().includes(u.apQ)) &&
    (!u.apCat || a.categories.includes(u.apCat)) && (!u.apSrc || a.source.source === u.apSrc) &&
    (!u.apFrom || apWhen(a).slice(0, 10) >= u.apFrom) && (!u.apTo || apWhen(a).slice(0, 10) <= u.apTo));
}

ROUTES.approved = async function (first) {
  if (first) {
    await Promise.all([loadArticles(), loadState(), loadSettings()]);   // no wait for the live WordPress check
    if (!S.wp) loadWp();
    if (S.state.wp_ready && !S.wpLists) S.wpLists = await api('/api/wordpress/lists').catch(() => null);
    AP_FILTERS.forEach(k => { S.ui[k] = ''; });
    Object.assign(S.ui, { apTab: 'all', apPage: 1, apMode: 'now' });
  }
  const all = S.articles.filter(apIn);
  for (const id of [...S.asel]) if (!all.some(a => a.id === id)) S.asel.delete(id);
  const groups = { all, ...Object.fromEntries(AP_TABS.slice(1).map(([k]) => [k, all.filter(a => apGroup(a) === k)])) };

  let list = apFiltered().sort((a, b) => apWhen(b).localeCompare(apWhen(a)));
  list = sortList('ap', list, { title: a => a.title, category: a => a.categories[0] || '', date: apWhen, status: apStatusLabel, seo: a => a.seo });
  const per = perPage('ap'), page = Math.min(S.ui.apPage, Math.max(1, Math.ceil(list.length / per)));
  S.ui.apPage = page;
  const slice = list.slice((page - 1) * per, page * per);
  if (!list.some(a => a.id === S.ui.apSel)) S.ui.apSel = slice[0]?.id || null;
  const sel = byId(S.ui.apSel);

  // KPI notes are built from real data only (approval dates, schedule times), not placeholder trends
  const DAY = 864e5, now = Date.now(), age = iso => (now - new Date(iso).getTime()) / DAY;
  const approvedThisWeek = S.articles.filter(a => a.approved_at && age(a.approved_at) < 7).length;
  const approvedLastWeek = S.articles.filter(a => a.approved_at && age(a.approved_at) >= 7 && age(a.approved_at) < 14).length;
  const nextUp = groups.scheduled.map(a => a.scheduled_for).filter(t => t && new Date(t).getTime() > now).sort()[0];
  const wpDrafts = groups.ready.filter(a => a.status === 'draft').length;
  const readyInView = list.filter(a => apGroup(a) === 'ready');
  const nSel = S.asel.size, cats = [...new Set(all.flatMap(a => a.categories))], srcs = [...new Set(all.map(a => a.source.source))];
  const filtersOn = AP_FILTERS.some(k => S.ui[k]);
  const allOnPage = slice.length && slice.every(a => S.asel.has(a.id));

  const bulkItem = (a, ic, label, cls = '') => `<button class="dd-item ${cls}" data-act="${a === 'schedule' ? 'ap-bulk-schedule' : 'ap-bulk'}" data-a="${a}" ${nSel ? '' : 'disabled'}>${icon(ic)}${label}</button>`;
  paint(`
  ${pageHead({ crumb: 'Approved Articles', icon: 'approved', color: 'g-green', title: 'Approved Articles', sub: 'Manage approved articles and publish to WordPress or schedule for later.',
    right: `<div class="dd"><button class="btn" data-act="dd">${icon('gear')}Bulk Actions${icon('chev')}</button><div class="dd-menu">
        <div class="dd-hint">${nSel ? `${nSel} article${nSel > 1 ? 's' : ''} selected` : 'Tick articles in the table first'}</div>
        ${bulkItem('publish', 'send', 'Publish selected')}${bulkItem('draft', 'save', 'Send selected as WordPress draft')}${bulkItem('schedule', 'calendar', 'Schedule selected…')}
        <div class="dd-sep"></div>${bulkItem('approve', 'tick', 'Approve selected')}${bulkItem('changes', 'edit', 'Mark selected as needs changes')}
        <div class="dd-sep"></div>${bulkItem('delete', 'trash', 'Remove selected from dashboard', 'danger')}</div></div>
      <div class="dd"><button class="btn" data-act="dd">${icon('download')}Export${icon('chev')}</button><div class="dd-menu">
        <button class="dd-item" data-act="ap-export" data-scope="view">${icon('filter')}Current view as CSV (${list.length})</button>
        <button class="dd-item" data-act="ap-export" data-scope="all">${icon('list')}All approved articles as CSV (${all.length})</button></div></div>
      <button class="btn primary" data-act="ap-publish-all" data-busy="Publishing…" ${(nSel || readyInView.length) && S.state.wp_ready ? '' : 'disabled'}>${icon('send')}${nSel ? `Publish Selected (${nSel})` : `Publish to WordPress (${readyInView.length})`}</button>` })}
  <div class="kpis stagger">
    ${kpi({ g: 'green', ic: 'approved', val: all.length, label: 'Approved Articles', ...trendNote(approvedThisWeek, approvedLastWeek, 'vs last week') })}
    ${kpi({ g: 'blue', ic: 'send', val: groups.ready.length, label: 'Ready to Publish', note: wpDrafts ? `${wpDrafts} saved as WordPress draft` : 'Waiting to go live' })}
    ${kpi({ g: 'violet', ic: 'calendar', val: groups.scheduled.length, label: 'Scheduled', note: nextUp ? `Next: ${fmtDT(nextUp)}` : 'Nothing scheduled' })}
    ${kpi({ g: 'orange', ic: 'clock', val: groups.changes.length, label: 'Pending Changes', note: groups.changes.length ? 'Need edits before publishing' : 'Nothing pending' })}
    ${kpi({ g: 'pink', ic: 'warn', val: groups.failed.length, label: 'Failed to Publish', note: groups.failed.length ? 'Retry from the Failed tab' : 'No failed publishes' })}
  </div>
  <div class="card toolbar">
    <div class="search-in grow">${icon('search')}<input class="input" id="ap-q" placeholder="Search approved articles…" value="${esc(S.ui.apQ)}"></div>
    <select class="select" id="ap-cat"><option value="">All Categories</option>${cats.map(c => `<option ${S.ui.apCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="select" id="ap-src"><option value="">All Sources</option>${srcs.map(s => `<option ${S.ui.apSrc === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <select class="select" id="ap-status"><option value="">All Status</option>${AP_TABS.slice(1).map(([k, l]) => `<option value="${k}" ${S.ui.apStatus === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="date-range" title="Approved between">${icon('calendar')}<input type="date" id="ap-from" value="${esc(S.ui.apFrom)}" aria-label="Approved from"><span>–</span><input type="date" id="ap-to" value="${esc(S.ui.apTo)}" aria-label="Approved to"></div>
    <button class="btn" data-act="ap-clear" ${filtersOn ? '' : 'disabled'}>${icon('x')}Clear Filters</button>
  </div>
  <div class="grid-side" style="grid-template-columns:minmax(0,1fr) 340px">
    <div class="card section ap-card">
      <div class="tabs underline">${AP_TABS.map(([k, l]) => `<button class="tab ${S.ui.apTab === k ? 'on' : ''}" data-act="ap-tab" data-v="${k}">${l} (${groups[k].length})</button>`).join('')}</div>
      ${slice.length ? `<div class="table-wrap"><table class="ap-table"><thead><tr>
        <th style="width:36px"><div class="cb ${allOnPage ? 'on' : ''}" data-act="ap-pick-page" title="Select this page">${icon('tick')}</div></th><th class="ap-c-num">#</th><th class="ap-c-thumb">Thumbnail</th>
        ${th('ap', 'title', 'Article Title')}<th class="ap-c-src">Source</th>${apTh('category', 'Category', 'ap-c-cat')}${apTh('date', 'Approved Date', 'ap-c-date')}${apTh('status', 'Publish Status', 'ap-c-status')}${apTh('seo', 'SEO', 'ap-c-seo')}<th>Actions</th></tr></thead><tbody>
        ${slice.map((a, i) => apRow(a, (page - 1) * per + i + 1)).join('')}
      </tbody></table></div>${pager(list.length, page, per, 'ap-page')}`
      : empty('approved', all.length ? 'No articles match' : 'No approved articles yet', all.length ? 'Try another tab or clear the filters.' : 'Approve articles in the Review Center and they will appear here.',
        all.length ? `<button class="btn" data-act="ap-clear">${icon('x')}Clear Filters</button>` : `<a class="btn primary" href="#/review">${icon('check')}Open Review Center</a>`)}
    </div>
    <div class="stack sticky">${apPreview(sel)}${apOptions(sel)}</div>
  </div>`, first);
  renderBulk();
  apBindInputs();
};

// sortable header with an extra class, so narrow layouts can hide the column
const apTh = (key, label, cls) => th('ap', key, label).replace('<th class="', `<th class="${cls} `);

function apRow(a, n) {
  const on = S.asel.has(a.id), g = apGroup(a);
  const more = [
    `<button class="dd-item" data-act="wp-schedule" data-id="${a.id}">${icon('calendar')}Schedule…</button>`,
    `<a class="dd-item" href="#/review/${a.id}">${icon('edit')}Edit in Review Center</a>`,
    `<button class="dd-item" data-act="one" data-a="draft" data-id="${a.id}">${icon('save')}Send as WordPress draft</button>`,
    g === 'changes' ? `<button class="dd-item" data-act="one" data-a="approve" data-id="${a.id}">${icon('tick')}Approve</button>` : `<button class="dd-item" data-act="one" data-a="changes" data-id="${a.id}">${icon('edit')}Mark as needs changes</button>`,
    a.url ? `<a class="dd-item" target="_blank" href="${esc(a.url)}">${icon('ext')}Open on WordPress</a>` : '',
    a.wp_id ? `<a class="dd-item" target="_blank" href="${esc(siteUrlOf(a))}/wp-admin/post.php?post=${a.wp_id}&action=edit">${icon('wp')}Edit in WordPress</a>` : '',
    `<div class="dd-sep"></div><button class="dd-item danger" data-act="one" data-a="delete" data-id="${a.id}">${icon('trash')}Remove from dashboard</button>`,
  ].join('');
  return `<tr class="clickable ${on ? 'on' : ''} ${a.id === S.ui.apSel ? 'cur' : ''}" data-act="ap-pick" data-id="${a.id}">
    <td><div class="cb ${on ? 'on' : ''}" data-act="pick-art" data-id="${a.id}">${icon('tick')}</div></td>
    <td class="row-meta ap-c-num">${n}</td>
    <td class="ap-c-thumb">${thumb(a)}</td>
    <td><div class="t-title wrap ${mr(a.title)}">${esc(a.title)}</div>${siteChip(a)}${a.excerpt ? `<div class="ap-ex ${mr(a.excerpt)}">${esc(a.excerpt)}</div>` : ''}
      <div class="ap-inline">${srcLogo(a.source.source, 'xs')}<span class="ap-src">${esc(a.source.source)}</span>${srcCount(a)}${catPill(a.categories[0])}<span class="ap-inline-date">${fmtDate(apWhen(a))}, ${fmtTime(apWhen(a))}</span><span class="ap-inline-status">${apBadge(a)}</span></div></td>
    <td class="ap-c-src"><div class="tcell" style="gap:8px">${srcLogo(a.source.source, 'sm')}<span class="ap-src">${esc(a.source.source)}</span></div>${srcCount(a)}</td>
    <td class="ap-c-cat">${catPill(a.categories[0])}</td>
    <td class="row-meta ap-c-date" style="white-space:nowrap">${fmtDate(apWhen(a))}<br>${fmtTime(apWhen(a))}</td>
    <td class="ap-c-status">${apStatus(a)}</td>
    <td class="ap-c-seo">${ring(a.seo, true)}</td>
    <td><div class="acts">
      <button class="icon-btn green" data-act="one" data-a="publish" data-id="${a.id}" title="Publish now">${icon('send')}</button>
      <button class="icon-btn blue ap-a-wide" data-act="wp-schedule" data-id="${a.id}" title="Schedule">${icon('calendar')}</button>
      <a class="icon-btn ap-a-wide" href="#/review/${a.id}" title="Edit in Review Center">${icon('edit')}</a>
      <div class="dd"><button class="icon-btn" data-act="dd" title="More">${icon('more')}</button><div class="dd-menu">${more}</div></div>
    </div></td></tr>`;
}

function apPreview(a) {
  if (!a) return `<div class="card section">${empty('approved', 'No article selected', 'Pick an article in the table to see it here.')}</div>`;
  const chips = [...new Set([...a.categories, ...a.tags])].slice(0, 6);
  return `<div class="card section">
    <div class="section-head"><div class="section-title" style="font-size:15px">Selected Article Preview</div><a class="link" href="#/review/${a.id}" style="white-space:nowrap">View Full Article →</a></div>
    <div class="tcell" style="align-items:flex-start">${thumb(a, 'thumb lg')}<div style="min-width:0">
      <div class="ap-pv-title ${mr(a.title)}">${esc(a.title)}</div>
      <div class="ap-pv-meta">${srcLogo(a.source.source, 'xs')}<span>${esc(a.source.source)}</span><span>·</span><span>${fmtDate(apWhen(a))}</span></div></div></div>
    ${a.excerpt ? `<p class="ap-pv-ex ${mr(a.excerpt)}">${esc(a.excerpt)}</p>` : ''}
    ${chips.length ? `<div class="ap-chips">${chips.map(t => `<span class="tag ${mr(t)}">${esc(t)}</span>`).join('')}</div>` : ''}
    ${apFailed(a) ? `<div class="alert err" style="margin:14px 0 0">${icon('alert')}<div><b>Last publish failed</b><br>${esc(a.publish_error)}</div></div>`
      : a.status === 'changes' ? `<div class="alert warn" style="margin:14px 0 0">${icon('warn')}<div>Marked as needing changes. Edit it in the Review Center before publishing.</div></div>` : ''}
  </div>`;
}

function apOptions(a) {
  if (!a) return '';
  const wpOn = siteById(a.website_id)?.connected ?? S.state.wp_ready, pub = S.settings?.publish || {}, mode = S.ui.apMode;
  const cats = [...new Set([...(S.wpLists?.categories || []), ...a.categories])];
  return `<div class="card section">
    <div class="section-title" style="font-size:15px;margin-bottom:12px">Publishing Options</div>
    <div class="seg"><button class="${mode === 'now' ? 'on' : ''}" data-act="ap-mode" data-v="now">Publish Now</button><button class="${mode === 'schedule' ? 'on' : ''}" data-act="ap-mode" data-v="schedule">Schedule</button></div>
    <div class="field"><label>WordPress Site</label><div class="ap-site"><div class="wp-logo sm">${icon('wp')}</div><span class="ap-site-url">${esc((siteUrlOf(a) || 'Not configured').replace(/^https?:\/\//, ''))}</span>
      ${wpOn ? '<span class="badge b-live"><span class="bd"></span>Connected</span>' : '<a class="badge b-failed" href="#/wordpress">Connect</a>'}</div></div>
    <div class="${mode === 'schedule' ? 'field-row' : ''}">
      <div class="field"><label>Post Category</label><select class="select mr" id="ap-o-cat" style="width:100%"><option value="">— None —</option>${cats.map(c => `<option ${a.categories[0] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      ${mode === 'schedule' ? `<div class="field"><label>Publish at</label><input class="input" type="datetime-local" id="ap-o-when" value="${a.status === 'scheduled' && a.scheduled_for ? esc(a.scheduled_for.slice(0, 16)) : apLocalNow(36e5)}"></div>` : ''}
    </div>
    <div class="field"><label>Tags (comma separated)</label><input class="input mr" id="ap-o-tags" value="${esc(a.tags.join(', '))}"></div>
    ${[['featured_image', 'Include featured image'], ['rankmath_meta', 'Auto-generate meta title & description']].map(([k, l]) => `<div class="switch-row"><div class="sl">${l}</div><button class="switch ${pub[k] ? 'on' : ''}" data-act="set-toggle" data-key="publish.${k}"></button></div>`).join('')}
    <div class="row-meta">These two switches apply to every publish.</div>
    <div class="ap-btns">
      <button class="btn" data-act="ap-go" data-a="draft" data-busy="Saving…" ${wpOn ? '' : 'disabled'}>${icon('save')}Save as Draft</button>
      ${mode === 'schedule' ? `<button class="btn primary" data-act="ap-go" data-a="schedule" data-busy="Scheduling…" ${wpOn ? '' : 'disabled'}>${icon('calendar')}Schedule</button>`
        : `<button class="btn primary" data-act="ap-go" data-a="publish" data-busy="Publishing…" ${wpOn ? '' : 'disabled'}>${icon('send')}Publish Now</button>`}
    </div>
    ${wpOn ? '' : `<div class="row-meta" style="margin-top:8px">Connect WordPress to publish.</div>`}
  </div>`;
}

function apBindInputs() {
  const set = (key, v) => { S.ui[key] = v; S.ui.apPage = 1; };
  const q = $('#ap-q');
  if (q) q.oninput = e => { set('apQ', e.target.value.toLowerCase()); clearTimeout(S._apq); S._apq = setTimeout(() => { ROUTES.approved(false); const x = $('#ap-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
  [['#ap-cat', 'apCat'], ['#ap-src', 'apSrc'], ['#ap-status', 'apStatus'], ['#ap-from', 'apFrom'], ['#ap-to', 'apTo']].forEach(([id, key]) => {
    const el = $(id); if (el) el.onchange = e => { set(key, e.target.value); ROUTES.approved(false); };
  });
}

// ------------------------------------------------------------------ dropdown menus
// The open menu is copied into one floating element on <body>: inside the table card (a CSS container, which acts as
// the containing block for position:fixed) or the scrolling table it would be mispositioned or clipped.
let ddOwner = null;
const ddFloat = () => $('#dd-float') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dd-float', className: 'dd-menu' }));
const ddClose = () => { ddOwner = null; const f = $('#dd-float'); if (f) { f.classList.remove('show'); f.innerHTML = ''; } };
ACTIONS.dd = el => {
  if (ddOwner === el) return ddClose();
  const f = ddFloat();
  f.innerHTML = el.closest('.dd').querySelector('.dd-menu').innerHTML; hydrate(f);
  f.classList.add('show'); ddOwner = el;
  const r = el.getBoundingClientRect();
  const top = r.bottom + 6 + f.offsetHeight > innerHeight - 8 ? r.top - 6 - f.offsetHeight : r.bottom + 6;
  f.style.top = `${Math.max(8, top)}px`;
  f.style.left = `${Math.max(8, Math.min(r.right - f.offsetWidth, innerWidth - f.offsetWidth - 8))}px`;
};
// runs after the global [data-act] handler: close when an item was chosen or the click landed outside the menu
document.addEventListener('click', e => {
  if (e.target.closest('#dd-float') ? e.target.closest('.dd-item:not(:disabled)') : !e.target.closest('[data-act="dd"]')) ddClose();
});
window.addEventListener('scroll', ddClose, { passive: true });
window.addEventListener('resize', ddClose);

// ------------------------------------------------------------------ actions
ACTIONS['ap-pick'] = (el, e) => {
  if (e.target.closest('a')) { ddClose(); return; }
  if (e.target.closest('.dd')) return;
  S.ui.apSel = el.dataset.id; ROUTES.approved(false);
};
ACTIONS['ap-pick-page'] = (el, e) => {
  e.stopPropagation();
  const ids = $$('.ap-table tbody tr').map(tr => tr.dataset.id), all = ids.every(id => S.asel.has(id));
  ids.forEach(id => all ? S.asel.delete(id) : S.asel.add(id));
  ROUTES.approved(false);
};
ACTIONS['ap-tab'] = el => { S.ui.apTab = el.dataset.v; S.ui.apPage = 1; ROUTES.approved(false); };
ACTIONS['ap-page'] = el => { S.ui.apPage = +el.dataset.p; ROUTES.approved(false); };
ACTIONS['ap-mode'] = el => { S.ui.apMode = el.dataset.v; ROUTES.approved(false); };
ACTIONS['ap-clear'] = () => { AP_FILTERS.forEach(k => { S.ui[k] = ''; }); S.ui.apPage = 1; ROUTES.approved(false); };
ACTIONS['ap-bulk'] = el => { ddClose(); return runBulk(el.dataset.a, [...S.asel], null); };
ACTIONS['ap-publish-all'] = el => runBulk('publish', S.asel.size ? [...S.asel] : apFiltered().filter(a => apGroup(a) === 'ready').map(a => a.id), el);

ACTIONS['ap-go'] = async el => {
  const a = byId(S.ui.apSel); if (!a) return;
  const action = el.dataset.a, extra = {};
  if (action === 'schedule') {
    const v = $('#ap-o-when')?.value;
    if (!v || new Date(v) <= new Date()) return toast('err', 'Pick a time in the future');
    extra.when = v.length === 16 ? `${v}:00` : v;   // WordPress needs seconds in the date
  }
  // category / tags edited here are saved to the article before it is sent
  const cat = $('#ap-o-cat').value.trim(), tags = $('#ap-o-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const cats = cat ? [cat, ...a.categories.slice(1).filter(c => c !== cat)] : a.categories.slice(1);
  if (cats.join('|') !== a.categories.join('|') || tags.join('|') !== a.tags.join('|')) {
    try { await api(`/api/articles/${a.id}/edit`, { method: 'POST', body: { categories: cats, tags } }); }
    catch (e) { return toast('err', 'Could not save category / tags', e.message); }
  }
  await runBulk(action, [a.id], el, extra);
};

ACTIONS['ap-bulk-schedule'] = () => {
  ddClose();
  const ids = [...S.asel]; if (!ids.length) return toast('info', 'Select articles first');
  const m = modal(`<h3>Schedule ${ids.length} article${ids.length > 1 ? 's' : ''}</h3><p>Posts go live one after another, starting at the first time (site timezone).</p>
    <div class="field-row"><div class="field"><label>First publish time</label><input class="input" type="datetime-local" id="aps-start" value="${apLocalNow(36e5)}"></div>
    <div class="field"><label>Interval</label><select class="select" id="aps-gap" style="width:100%">${[[30, 'Every 30 minutes'], [60, 'Every hour'], [120, 'Every 2 hours'], [180, 'Every 3 hours'], [1440, 'One per day']].map(([v, l]) => `<option value="${v}" ${v === 120 ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="mbtns"><button class="btn" data-x>Cancel</button><button class="btn primary" id="aps-ok" data-busy="Scheduling…">${icon('calendar')}Schedule</button></div>`, 'sm');
  $('[data-x]', m).onclick = closeModal;
  $('#aps-ok', m).onclick = () => busy($('#aps-ok', m), async () => {
    const start = new Date($('#aps-start', m).value).getTime(), gap = +$('#aps-gap', m).value * 60e3;
    if (!(start > Date.now())) return toast('err', 'Pick a time in the future');
    let done = 0;
    for (const [i, id] of ids.entries()) {
      const when = new Date(start + i * gap - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 19);
      const r = await api('/api/articles/bulk', { method: 'POST', body: { action: 'schedule', ids: [id], when } });
      done += r.done.length; r.done.forEach(x => S.asel.delete(x)); r.failed.forEach(f => toast('err', 'Could not schedule', f.error));
    }
    closeModal();
    if (done) toast('ok', `${done} article${done > 1 ? 's' : ''} scheduled`);
    await Promise.all([loadArticles(), loadState()]); loadWp(); rerender();
  });
};

ACTIONS['ap-export'] = el => {
  ddClose();
  const rows = el.dataset.scope === 'all' ? S.articles.filter(apIn) : apFiltered();
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [['Title', 'Publish status', 'Categories', 'Source', 'Approved', 'Scheduled for', 'SEO', 'WordPress URL'],
    ...rows.map(a => [a.title, apStatusLabel(a), a.categories.join(', '), a.source.source, apWhen(a), a.scheduled_for, a.seo, a.url])].map(r => r.map(cell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));   // BOM so Excel reads Marathi correctly
  link.download = `approved-articles-${today()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
