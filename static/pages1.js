/* Pages: Dashboard, Government Sources, Discover, Selected Articles, Processing Queue */

// ------------------------------------------------------------------ DASHBOARD
ROUTES.dashboard = async function (first) {
  if (first) await Promise.all([loadState(), loadArticles(), loadTitles(), loadSources(), loadWp(), S.claude ? null : loadClaude(), api('/api/rules').then(d => { S.rules = d.items; })]);
  const st = S.state, c = S.counts, arts = S.articles, t = today();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const review = c.review || 0, working = c.working || 0;
  const tNew = trendNote(st.titles_today, st.titles_yesterday), tPub = trendNote(st.published_today, st.published_yesterday);
  const stage = (href, cls, n, title, sub, active) => `<a class="stage" href="${href}"><div class="stage-ring ${cls} ${active ? 'active' : ''}">${n}</div><b>${title}</b><span>${sub}</span></a>`;
  const arrow = `<div class="pipe-arrow">${icon('arrow')}</div>`;
  const wp = S.wp || {}, stats = S.titles.stats || {};
  const topSources = [...S.sources].filter(s => s.enabled).sort((a, b) => (b.today || 0) - (a.today || 0) || (b.total || 0) - (a.total || 0)).slice(0, 6);
  const queue = arts.filter(a => ['queued', 'writing', 'error', 'paused'].includes(a.status)).concat(arts.filter(a => inReview(a))).slice(0, 6);
  const published = arts.filter(a => a.status === 'published').slice(0, 5);
  const rulesOn = (S.rules || []).filter(r => r.enabled);
  const sched = rulesOn.find(r => r.trigger === 'schedule' && r.action === 'fetch');

  paint(`
  <div class="page-head">
    <div><h1>${greet}, ${esc((S.state.user_name || 'Admin').split(' ')[0])}! 👋</h1><div class="subtitle">Here's what's happening with your current affairs content today.</div></div>
    <div class="head-right" style="text-align:right;display:block"><b style="font-size:14px">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</b><div class="subtitle" style="font-size:12.5px">Last updated: ${ago(st.fetched_at)}</div></div>
  </div>
  <div class="kpis stagger">
    ${kpi({ href: '#/sources', g: 'blue', ic: 'db', val: st.sources_active || 0, label: 'Active Sources', note: `${st.sources_total} configured · ${st.sources_errors || 0} errors`, trend: st.sources_errors ? 'down' : '' })}
    ${kpi({ href: '#/discover', g: 'green', ic: 'file', val: st.titles_today || 0, label: 'New Articles Today', ...tNew })}
    ${kpi({ href: '#/queue', g: 'violet', ic: 'brain', val: working, label: 'AI Processing', note: working ? `${st.working_now} writing now` : 'Queue is idle', trend: working ? 'up' : '' })}
    ${kpi({ href: '#/review', g: 'orange', ic: 'eye', val: review, label: 'Ready for Review', note: `${c.approved || 0} approved · ${c.draft || 0} drafts`, trend: review ? 'up' : '' })}
    ${kpi({ href: '#/published', g: 'pink', ic: 'rocket', val: st.published_today || 0, label: 'Published Today', ...tPub })}
  </div>
  <div class="grid-a">
    <div class="card section fade-up">
      <div class="section-head"><div class="section-title">Content Pipeline ${icon('info')}</div><a class="btn sm soft" href="#/queue">View Details ${icon('arrow')}</a></div>
      <div class="pipeline">
        ${stage('#/discover', 's-blue', S.titles.items.length, 'Found', 'Articles', false)}${arrow}
        ${stage('#/selected', 's-green', c.all || 0, 'Selected', 'Articles', false)}${arrow}
        ${stage('#/selected', 's-orange', (c.extracted || 0) + arts.filter(a => a.has_text && !['selected', 'extracted'].includes(a.status)).length, 'Extracted', 'Articles', false)}${arrow}
        ${stage('#/queue', 's-violet', working, 'Claude AI', 'Processing', working > 0)}${arrow}
        ${stage('#/review', 's-pink', review, 'Review', 'Articles', false)}${arrow}
        ${stage('#/published', 's-teal', c.published || 0, 'Published', 'Articles', false)}
      </div>
    </div>
    <div class="card section fade-up">
      <div class="wp-head"><div class="wp-logo">${icon('wp')}</div><div style="flex:1;min-width:0"><b>WordPress Connection</b><div class="row-meta">${esc((wp.url || st.wp_url || 'Not configured').replace(/^https?:\/\//, ''))}</div></div>
        ${wp.connected ? '<span class="badge b-live">Connected</span>' : '<span class="badge b-failed">Not connected</span>'}</div>
      ${wp.connected ? `<div class="wp-stats"><div><b>${wp.today ?? '—'}</b><span>Posts Today</span></div><div><b>${wp.drafts ?? '—'}</b><span>Drafts</span></div><div><b>${wp.total ?? '—'}</b><span>Total Posts</span></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><a class="btn soft block" href="#/wordpress">Manage</a><a class="btn primary block" target="_blank" href="${esc(wp.url)}/wp-admin/post-new.php">${icon('plus')}New Post</a></div>`
      : `<p class="subtitle" style="margin:0 0 16px">Connect your site to send articles as drafts and publish with one click.</p><a class="btn primary block" href="#/wordpress">${icon('key')}Connect WordPress</a>`}
    </div>
  </div>
  <div class="grid-b">
    <div class="card section fade-up">
      <div class="section-head"><div class="section-title">Today's Top Sources ${icon('info')}</div><a class="link" href="#/sources">View All</a></div>
      <div class="table-wrap"><table><thead><tr><th>Source</th><th>Articles</th><th>Last scan</th><th>Status</th></tr></thead><tbody>
      ${topSources.map(s => { const x = stats[s.id] || {}; return `<tr class="clickable" data-href="#/sources"><td><div class="tcell">${srcLogo(s.name)}<b>${esc(s.name)}</b></div></td><td>${s.today || 0}</td><td class="row-meta">${ago(x.checked)}</td><td>${x.error ? '<span class="badge b-failed"><span class="bd"></span>Error</span>' : '<span class="badge b-active"><span class="bd"></span>Active</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px"><button class="btn primary" data-act="add-source">${icon('plus')}Add New Source</button><button class="btn" data-act="scan" data-busy="Scanning…">${icon('refresh')}Scan All Sources</button></div>
    </div>
    <div class="card section fade-up">
      <div class="section-head"><div class="section-title">Recent Articles</div><a class="link" href="#/review">View All</a></div>
      ${arts.length ? arts.slice(0, 7).map(a => `<div class="row-item clickable" data-href="#/article/${a.id}">${thumb(a, 'thumb sm')}<div class="row-main"><div class="row-title ${mr(a.title)}">${esc(a.title)}</div><div class="row-meta">${esc(a.source.source)} · ${ago(a.created)}</div></div>${badge(a.status)}</div>`).join('')
      : empty('file', 'No articles yet', 'Pick news in Discover to start writing.', `<a class="btn primary" href="#/discover">${icon('search')}Discover articles</a>`)}
    </div>
    <div class="stack">
      <div class="card section fade-up">
        <div class="section-title" style="margin-bottom:14px">Quick Actions</div>
        <div class="quick" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <button class="qa blue" data-act="scan" data-busy="Scanning…" style="border-radius:14px;padding:18px 10px;border:0;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;background:#dbeafe;color:#1d4ed8">${icon('db')}Scan Sources</button>
          <a class="qa green" href="#/discover" style="border-radius:14px;padding:18px 10px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;background:#d1fae5;color:#047857;text-decoration:none">${icon('file')}Discover Articles</a>
          <a class="qa violet" href="#/review" style="border-radius:14px;padding:18px 10px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;background:#ede9fe;color:#6d28d9;text-decoration:none">${icon('eye')}Open Review Center</a>
          <a class="qa pink" href="#/wordpress" style="border-radius:14px;padding:18px 10px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;background:#fce7f3;color:#be185d;text-decoration:none">${icon('rocket')}Publish to WordPress</a>
        </div>
      </div>
      <div class="card section fade-up">
        <div class="section-head"><div class="section-title">Automation Status</div>${rulesOn.length || working ? '<span class="badge b-live"><span class="bd"></span>Running</span>' : '<span class="badge b-off">Manual</span>'}</div>
        <div class="sum-row">${icon('clock')}<div>Source Scanning</div><div class="sv">${sched ? (sched.config?.time ? `Daily at ${sched.config.time}` : `Every ${sched.config?.minutes || 30} minutes`) : 'Manual'}</div></div>
        <div class="sum-row">${icon('file')}<div>New Article Detection</div><div class="sv">${rulesOn.some(r => r.trigger === 'new_article') ? 'Enabled' : 'Manual'}</div></div>
        <div class="sum-row">${icon('brain')}<div>Claude AI Processing</div><div class="sv">${rulesOn.some(r => r.action === 'generate') ? 'Automatic' : 'Manual Trigger'}</div></div>
        <div class="sum-row">${icon('wp')}<div>WordPress Publishing</div><div class="sv">${rulesOn.some(r => r.action === 'publish') ? 'Automatic' : 'Manual Approval'}</div></div>
        <a class="btn soft block" href="#/automation" style="margin-top:12px">Configure Automation ${icon('arrow')}</a>
      </div>
    </div>
  </div>
  <div class="grid-c">
    <div class="card section fade-up">
      <div class="section-head"><div class="section-title">AI Processing Queue <span class="count-pill">${queue.length} Articles</span></div><a class="link" href="#/queue">View All</a></div>
      ${queue.length ? queueTable(queue, false) : empty('layers', 'Queue is empty', 'Selected news will appear here while Claude writes.')}
    </div>
    <div class="card section fade-up">
      <div class="section-head"><div class="section-title">Published Articles</div><a class="link" href="#/published">View All</a></div>
      ${published.length ? `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Published</th><th>SEO</th><th>Status</th></tr></thead><tbody>
        ${published.map(a => `<tr class="clickable" data-href="#/article/${a.id}"><td><div class="t-title ${mr(a.title)}" style="max-width:260px">${esc(a.title)}</div></td><td class="row-meta">${fmtDate(a.published_at)}</td><td>${ring(a.seo, true)}</td><td><a class="badge b-live" href="${esc(a.url)}" target="_blank" onclick="event.stopPropagation()"><span class="bd"></span>Live</a></td></tr>`).join('')}
      </tbody></table></div>` : empty('rocket', 'Nothing published yet', 'Articles you publish will show up here.')}
    </div>
  </div>`, first);
};

function queueTable(rows, withCheck = true) {
  return `<div class="table-wrap"><table><thead><tr>${withCheck ? '<th></th>' : ''}<th>#</th><th>Article title</th><th>Source</th><th>Stage</th><th>Progress</th><th>Status</th><th>Time</th><th>Actions</th></tr></thead><tbody>
  ${rows.map((a, i) => { const [stg, pct, cls] = stageOf(a); const live = a.status === 'writing'; return `<tr class="clickable ${S.asel.has(a.id) ? 'on' : ''}" data-href="#/article/${a.id}">
    ${withCheck ? `<td style="width:36px"><div class="cb ${S.asel.has(a.id) ? 'on' : ''}" data-act="pick-art" data-id="${a.id}">${icon('tick')}</div></td>` : ''}
    <td class="row-meta">${i + 1}</td>
    <td><div class="tcell">${thumb(a, 'thumb')}<div><div class="t-title wrap ${mr(a.title)}">${esc(a.title)}</div>${srcCount(a)}${a.error ?`<div class="t-sub" style="color:var(--danger-ink)">${esc(a.error.slice(0, 90))}</div>` : ''}</div></div></td>
    <td><div class="tcell">${srcLogo(a.source.source, 'sm')}<span style="font-size:12.5px">${esc(a.source.source)}</span></div></td>
    <td><span class="stage-pill ${cls}">${stg}</span></td>
    <td><div class="prog-cell"><div class="progress ${pct === 100 ? 'done' : ''} ${live ? 'live' : ''}"><i style="width:${pct}%"></i></div>${pct}%</div></td>
    <td>${badge(a.status === 'writing' ? 'writing' : a.status === 'queued' ? 'queued' : a.status === 'error' ? 'error' : a.status === 'paused' ? 'paused' : 'approved').replace('Approved', 'Completed')}</td>
    <td class="row-meta">${ago(a.updated || a.created)}</td>
    <td><div class="acts"><a class="icon-btn" href="#/article/${a.id}" title="View">${icon('eye')}</a>
      ${a.status === 'queued' ? `<button class="icon-btn blue" data-act="one" data-a="pause" data-id="${a.id}" title="Pause">${icon('pause')}</button>` : ''}
      ${a.status === 'paused' ? `<button class="icon-btn blue" data-act="one" data-a="resume" data-id="${a.id}" title="Resume">${icon('play')}</button>` : ''}
      ${a.status === 'error' ? `<button class="icon-btn red" data-act="one" data-a="retry" data-id="${a.id}" title="Retry">${icon('refresh')}</button>` : ''}
      ${['ready', 'approved', 'draft'].includes(a.status) ? `<span class="icon-btn green" title="Completed">${icon('tick')}</span>` : ''}</div></td></tr>`; }).join('')}
  </tbody></table></div>`;
}

// ------------------------------------------------------------------ SOURCES
ROUTES.sources = async function (first) {
  if (first) { await Promise.all([loadState(), loadSources(), loadTitles()]); S.ui.srcEdit = null; S.ui.srcTab = 'add'; S.ui.srcQ = ''; S.ui.srcStatus = ''; S.ui.srcCat = ''; S.ui.srcPage = 1; }
  const st = S.state, stats = S.titles.stats || {};
  let list = S.sources.filter(s => (!S.ui.srcQ || s.name.toLowerCase().includes(S.ui.srcQ) || (s.site || '').includes(S.ui.srcQ))
    && (!S.ui.srcStatus || (S.ui.srcStatus === 'active' ? s.enabled && !stats[s.id]?.error : S.ui.srcStatus === 'error' ? !!stats[s.id]?.error : !s.enabled))
    && (!S.ui.srcCat || s.category === S.ui.srcCat));
  list = sortList('src', list, { name: x => x.name, category: x => x.category, today: x => x.today || 0, scan: x => stats[x.id]?.checked || '' });
  const per = perPage('src'), page = S.ui.srcPage, slice = list.slice((page - 1) * per, page * per);
  const edit = S.ui.srcEdit ? S.sources.find(s => s.id === S.ui.srcEdit) : null;
  const errors = S.sources.filter(s => s.enabled && stats[s.id]?.error).length;
  paint(`
  ${pageHead({ crumb: 'Government Sources', icon: 'bank', color: 'g-blue', title: 'Government Sources', sub: 'Manage trusted websites to fetch latest current affairs articles automatically.',
    right: `<div class="head-info">${icon('clock')}<div><span>Last Scan</span><b>${st.fetched_at ? fmtDT(st.fetched_at) : 'Never'}</b></div></div><button class="btn primary lg" data-act="scan" data-busy="Scanning…">${icon('refresh')}Scan All Sources</button>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'blue', ic: 'db', val: st.sources_total, label: 'Total Sources', note: `${S.sources.filter(s => s.official).length} official government` })}
    ${kpi({ g: 'green', ic: 'check', val: st.sources_active, label: 'Active Sources', note: `${st.sources_total - st.sources_active} disabled` })}
    ${kpi({ g: 'orange', ic: 'file', val: st.titles_today, label: 'Articles Found Today', ...trendNote(st.titles_today, st.titles_yesterday) })}
    ${kpi({ g: errors ? 'red' : 'pink', ic: 'warn', val: errors, label: 'Errors', note: errors ? 'Check the sources below' : 'No issues', trend: errors ? 'down' : 'up' })}
  </div>
  <div class="grid-side">
    <div class="card section">
      <div class="section-head"><div class="section-title">All Government Sources</div><div class="acts"><div class="view-toggle"><button class="on">${icon('list')}</button><button data-act="src-grid">${icon('grid')}</button></div><button class="icon-btn" data-act="scan" title="Rescan">${icon('refresh')}</button></div></div>
      <div class="toolbar inner">
        <div class="search-in grow">${icon('search')}<input class="input" id="src-q" placeholder="Search sources…" value="${esc(S.ui.srcQ)}"></div>
        <select class="select" data-act="src-status"><option value="">All Status</option><option value="active" ${S.ui.srcStatus === 'active' ? 'selected' : ''}>Active</option><option value="error" ${S.ui.srcStatus === 'error' ? 'selected' : ''}>Error</option><option value="off" ${S.ui.srcStatus === 'off' ? 'selected' : ''}>Disabled</option></select>
        <select class="select" data-act="src-cat"><option value="">All Categories</option>${(S.sourceCats || []).map(c => `<option ${S.ui.srcCat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>#</th>${th('src', 'name', 'Source name')}${th('src', 'category', 'Category')}<th>Base URL</th>${th('src', 'today', 'Articles today')}${th('src', 'scan', 'Last scan')}<th>Status</th><th>Actions</th></tr></thead><tbody>
      ${slice.map((s, i) => { const x = stats[s.id] || {}; return `<tr class="${edit?.id === s.id ? 'on' : ''}">
        <td class="row-meta">${(page - 1) * per + i + 1}</td>
        <td><div class="tcell">${srcLogo(s.name)}<div><b class="${mr(s.name)}">${esc(s.name)}</b>${s.official ? ' <span class="badge b-official" style="padding:2px 7px;font-size:10px">Official</span>' : ''}<div class="t-sub">${esc(s.label)}${s.description ? ' · ' + esc(s.description) : ''}</div></div></div></td>
        <td>${catPill(s.category)}</td>
        <td><a class="link" target="_blank" href="${esc(s.site)}" style="font-size:12.5px">${esc((s.site || '').replace(/^https?:\/\//, '').slice(0, 34))}</a></td>
        <td><b>${s.today || 0}</b> <span class="row-meta">/ ${s.total || 0}</span></td>
        <td class="row-meta">${ago(x.checked)}</td>
        <td>${!s.enabled ? '<span class="badge b-off">Disabled</span>' : x.error ? `<span class="badge b-failed" title="${esc(x.error)}"><span class="bd"></span>Error</span>` : '<span class="badge b-active"><span class="bd"></span>Active</span>'}</td>
        <td><div class="acts"><button class="icon-btn blue" data-act="src-scan-one" data-id="${s.id}" title="Scan now">${icon('play')}</button><button class="icon-btn" data-act="src-edit" data-id="${s.id}" title="Edit">${icon('edit')}</button><button class="icon-btn red" data-act="remove-source" data-id="${s.id}" data-name="${esc(s.name)}" title="Delete">${icon('trash')}</button><button class="switch ${s.enabled ? 'on' : ''}" data-act="toggle-source" data-id="${s.id}" title="${s.enabled ? 'Disable' : 'Enable'}" style="width:36px;height:20px"></button></div></td></tr>`; }).join('') || `<tr><td colspan="8">${empty('search', 'No sources match', 'Try another filter.')}</td></tr>`}
      </tbody></table></div>
      ${pager(list.length, page, per, 'src-page')}
    </div>
    <div class="card section src-panel sticky">
      <div class="section-head"><div class="section-title">${edit ? 'Edit Source' : 'Add / Edit Government Source'}</div>${edit ? `<button class="icon-btn" data-act="src-edit" data-id="">${icon('x')}</button>` : ''}</div>
      <div class="source-tabs"><button class="${!edit ? 'on' : ''}" data-act="src-edit" data-id="">Add New Source</button><button class="${edit ? 'on' : ''}" ${edit ? '' : 'disabled'}>Edit Source</button></div>
      <form id="src-form">
        <div class="field"><label>Source Name <em>*</em></label><input class="input" name="name" required placeholder="e.g. Press Information Bureau" value="${esc(edit?.name || '')}"></div>
        <div class="field"><label>Website URL <em>*</em></label><input class="input" name="url" required placeholder="https://www.example.gov.in" value="${esc(edit?.site || '')}"><div class="hint">Paste the page that lists the daily news, or an RSS feed. The reading method is detected automatically.</div></div>
        <div class="field"><label>Category <em>*</em></label><select class="select" name="category" style="width:100%">${(S.sourceCats || []).map(c => `<option ${(edit?.category || 'General') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Description</label><textarea class="input" name="description" rows="2" placeholder="Short description about this source…">${esc(edit?.description || '')}</textarea></div>
        <div class="field"><label>Check Frequency</label><select class="select" name="frequency" style="width:100%">${[['manual', 'Manual (Scan button)'], ['30', 'Every 30 minutes'], ['60', 'Every hour'], ['180', 'Every 3 hours'], ['daily', 'Once a day']].map(([v, l]) => `<option value="${v}" ${(edit?.frequency || 'manual') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="hint">Frequency is applied through an Automation Rule (Schedule → Fetch Articles).</div></div>
        <div class="field"><label>Content Section (Optional)</label><input class="input" name="section" placeholder="e.g. Press Releases, News, Notifications" value="${esc(edit?.section || '')}"></div>
        <div class="switch-row" style="border:0"><div class="sl"><button type="button" class="switch ${edit ? (edit.enabled ? 'on' : '') : 'on'}" id="src-active"></button>Active</div></div>
        <div id="src-test"></div>
        <div style="display:flex;gap:10px;margin-top:8px"><button type="button" class="btn" id="src-test-btn" data-busy="Testing…">${icon('link')}Test Connection</button><button class="btn primary" style="flex:1;justify-content:center" data-busy="Saving…">${icon(edit ? 'save' : 'plus')}${edit ? 'Save Changes' : 'Add Source'}</button></div>
      </form>
    </div>
  </div>
  <div class="grid-3">
    <div class="card info-card info-blue"><div class="ic">${icon('gear')}</div><div><b>Automatic Scanning</b><p>Create a Schedule rule to scan sources every 30 minutes without clicking.</p><a class="link" href="#/automation">Configure Automation →</a></div></div>
    <div class="card info-card info-green"><div class="ic">${icon('shield')}</div><div><b>Trusted Government Sources</b><p>PIB and All India Radio are official. Coaching sites are marked as general sources.</p><a class="link" href="https://www.pib.gov.in" target="_blank">PIB website →</a></div></div>
    <div class="card info-card info-pink"><div class="ic">${icon('bulb')}</div><div><b>Pro Tip</b><p>Use the site's current-affairs listing page or RSS feed URL for the most reliable results.</p></div></div>
  </div>`, first);
  bindSourceForm(edit);
};

function bindSourceForm(edit) {
  const form = $('#src-form');
  if (!form) return;
  let detected = null;
  $('#src-active').onclick = e => e.currentTarget.classList.toggle('on');
  $('#src-q').oninput = e => { S.ui.srcQ = e.target.value.toLowerCase(); S.ui.srcPage = 1; clearTimeout(S._t); S._t = setTimeout(() => { ROUTES.sources(false); const q = $('#src-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
  $('#src-test-btn').onclick = () => busy($('#src-test-btn'), async () => {
    const box = $('#src-test'); box.innerHTML = '';
    try {
      detected = await api('/api/sources/detect', { method: 'POST', body: { url: form.url.value } });
      box.innerHTML = `<div class="alert ok fade-up" style="margin:8px 0">${icon('tick')}<div><b>Connection OK</b> · ${detected.sample.length}+ articles via ${esc(detected.label)}</div></div><div class="sample" style="margin-top:0">${detected.sample.slice(0, 5).map(i => `<div class="row-item"><div class="row-main"><div class="row-title ${mr(i.title)}" style="white-space:normal;font-size:12.5px">${esc(i.title)}</div></div></div>`).join('')}</div>`;
      if (!form.name.value) form.name.value = new URL(detected.config.base || detected.config.url || form.url.value).hostname.replace(/^www\./, '').split('.')[0].replace(/^./, c => c.toUpperCase());
    } catch (e) { box.innerHTML = `<div class="alert err fade-up" style="margin:8px 0">${icon('alert')}<div>${esc(e.message)}</div></div>`; }
    hydrate(box);
  });
  form.onsubmit = e => {
    e.preventDefault();
    const body = { name: form.name.value, url: form.url.value, category: form.category.value, description: form.description.value, frequency: form.frequency.value, section: form.section.value, enabled: $('#src-active').classList.contains('on') };
    busy(e.submitter, async () => {
      try {
        if (edit) await api(`/api/sources/${edit.id}`, { method: 'PATCH', body });
        else await api('/api/sources', { method: 'POST', body: { ...body, detected } });
        toast('ok', edit ? 'Source updated' : 'Source added', body.name);
        S.ui.srcEdit = null;
        await Promise.all([loadSources(), loadState(), loadTitles()]); updateNav(); ROUTES.sources(false);
      } catch (err) { $('#src-test').innerHTML = `<div class="alert err">${icon('alert')}<div>${esc(err.message)}</div></div>`; hydrate($('#src-test')); }
    });
  };
}
ACTIONS['src-edit'] = el => { S.ui.srcEdit = el.dataset.id || null; ROUTES.sources(false); };
ACTIONS['src-page'] = el => { S.ui.srcPage = +el.dataset.p; ROUTES.sources(false); };
ACTIONS['src-grid'] = () => toast('info', 'Grid view', 'Coming with the next update — the table has every source.');
ACTIONS['add-source'] = () => { S.ui.srcEdit = null; if (S.route !== 'sources') location.hash = '#/sources'; else { ROUTES.sources(false); $('#src-form input[name=url]')?.focus(); } };
ACTIONS['toggle-source'] = async el => {
  const s = S.sources.find(x => x.id === el.dataset.id);
  await api(`/api/sources/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } });
  toast('info', `${s.name} ${s.enabled ? 'disabled' : 'enabled'}`);
  await Promise.all([loadSources(), loadState()]); updateNav(); rerender();
};
ACTIONS['remove-source'] = async el => {
  if (!await confirmBox({ title: `Remove ${el.dataset.name}?`, text: 'This source will no longer be scanned. You can add it again later.', ok: 'Remove', kind: 'danger-solid' })) return;
  await api(`/api/sources/${el.dataset.id}`, { method: 'DELETE' });
  toast('ok', 'Source removed', el.dataset.name);
  await Promise.all([loadSources(), loadState()]); updateNav(); rerender();
};
ACTIONS['src-scan-one'] = async el => {
  const s = S.sources.find(x => x.id === el.dataset.id);
  el.innerHTML = '<span class="spin"></span>';
  try { const r = await api(`/api/sources/${s.id}/scan`, { method: 'POST' }); toast(r.stats.error ? 'err' : 'ok', `${s.name}: ${r.count} titles`, r.stats.error || ''); }
  finally { await Promise.all([loadSources(), loadTitles(), loadState()]); updateNav(); rerender(); }
};
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'src-status') { S.ui.srcStatus = el.value; S.ui.srcPage = 1; ROUTES.sources(false); }
  if (el.dataset.act === 'src-cat') { S.ui.srcCat = el.value; S.ui.srcPage = 1; ROUTES.sources(false); }
  if (el.dataset.act === 'feed-src') { S.feed.src = el.value; S.feed.page = 1; ROUTES.discover(false); }
  if (el.dataset.act === 'feed-cat') { S.feed.cat = el.value; S.feed.page = 1; ROUTES.discover(false); }
  if (el.dataset.act === 'feed-when') { S.feed.when = el.value; S.feed.page = 1; ROUTES.discover(false); }
  if (el.dataset.act === 'feed-sort') { S.feed.sort = el.value; ROUTES.discover(false); }
  if (el.dataset.act === 'sel-filter') { S.ui.selFilter = el.value; ROUTES.selected(false); }
});

// ------------------------------------------------------------------ DISCOVER
// the same story on other websites, shown under its row (it is written once, from all of them)
const alsoLine = i => i.also?.length ? `<div class="also">${icon('layers')}<span>Same news also on</span>${i.also.map(o => `<a href="${esc(o.url)}" target="_blank" title="${esc(o.title)}">${srcLogo(o.source, 'xs')}${esc(o.source)}</a>`).join('')}</div>` : '';
function feedItems() {
  const { q, src, cat, when, sort } = S.feed, t = today();
  const limit = new Date(); limit.setDate(limit.getDate() - 2);
  const min = limit.toLocaleDateString('en-CA');
  const fits = (i, c) => (!src || i.source === src) && (!cat || c === cat) && (!q || i.title.toLowerCase().includes(q.toLowerCase()));
  // a story found on several sources is listed once (its lead row); a filter matching any of its sources keeps it
  const latest = i => [i.date || t, ...(i.also || []).map(o => o.date || '')].sort().pop();   // newest date of any of its sources
  const items = S.titles.items.filter(i => (!i.group || i.group === i.url)
    && (fits(i, i.category) || (i.also || []).some(o => fits(o, i.category)))
    && (when === 'all' || (when === 'today' ? latest(i) === t : latest(i) >= min)));
  if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'source') items.sort((a, b) => a.source.localeCompare(b.source));
  return items;
}
ROUTES.discover = async function (first) {
  if (first) { await Promise.all([loadTitles(), loadState(), S.sources.length ? null : loadSources()]); updateNav();
    if (S.feed.when === 'today' && !S.feed.q && !S.titles.items.some(i => i.date === today())) S.feed.when = '3d'; }
  const st = S.state;
  const items = feedItems(), per = perPage('feed'), page = Math.min(S.feed.page, Math.max(1, Math.ceil(items.length / per)));
  S.feed.page = page;
  const slice = items.slice((page - 1) * per, page * per);
  const cats = [...new Set(S.titles.items.map(i => i.category).filter(Boolean))];
  const srcs = [...new Set(S.titles.items.map(i => i.source))];
  const selectable = slice.filter(i => !i.article_id), allSel = selectable.length && selectable.every(i => S.sel.has(i.url));
  const pv = S.feed.preview;
  paint(`
  ${pageHead({ crumb: 'Discover Articles', icon: 'search', color: 'g-violet', title: 'Discover Current Affairs Articles', sub: 'Find latest articles from trusted sources. Select multiple articles to process with AI.',
    right: `<div class="head-info">${icon('calendar')}<div><b>${S.feed.when === 'today' ? 'Today' : S.feed.when === '3d' ? 'Last 3 days' : 'All dates'}</b><span>${fmtDate(today())}</span></div></div>` })}
  <div class="kpis stagger">
    ${kpi({ g: 'blue', ic: 'file', val: st.titles_today, label: 'Articles Found Today', ...trendNote(st.titles_today, st.titles_yesterday) })}
    ${kpi({ g: 'green', ic: 'layers', val: st.sources_active, label: 'Sources Active', note: `${srcs.length} returned articles` })}
    ${kpi({ g: 'violet', ic: 'tagi', val: cats.length, label: 'Categories Available', note: cats.slice(0, 3).join(', ') })}
    ${kpi({ g: 'orange', ic: 'clock', val: st.fetched_at ? fmtTime(st.fetched_at) : '—', label: 'Last Scan', note: st.fetched_at ? fmtDate(st.fetched_at) : 'Never scanned', small: true })}
    <div class="card kpi cta"><button class="btn primary" data-act="scan" data-busy="Scanning…">${icon('refresh')}Scan Now</button></div>
  </div>
  <div class="card toolbar">
    <div class="search-in grow">${icon('search')}<input class="input" id="feed-q" placeholder="Search articles by title, keyword…" value="${esc(S.feed.q)}"></div>
    <select class="select" data-act="feed-src"><option value="">All Sources</option>${srcs.map(s => `<option ${S.feed.src === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <select class="select" data-act="feed-cat"><option value="">All Categories</option>${cats.map(c => `<option ${S.feed.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="select" data-act="feed-when"><option value="today" ${S.feed.when === 'today' ? 'selected' : ''}>Date: Today</option><option value="3d" ${S.feed.when === '3d' ? 'selected' : ''}>Last 3 days</option><option value="all" ${S.feed.when === 'all' ? 'selected' : ''}>All dates</option></select>
    <select class="select" data-act="feed-sort"><option value="latest">Sort: Latest First</option><option value="title" ${S.feed.sort === 'title' ? 'selected' : ''}>Title A–Z</option><option value="source" ${S.feed.sort === 'source' ? 'selected' : ''}>Source</option></select>
  </div>
  ${Object.keys(S.titles.errors || {}).length ? `<div class="alert warn">${icon('alert')}<div>Some sources could not be read: ${Object.keys(S.titles.errors).map(esc).join(', ')}</div></div>` : ''}
  <div class="${pv ? 'grid-side' : ''}">
    <div class="card disc-card" style="overflow:hidden">
      <div class="disc-head"><div class="cb ${allSel ? 'on' : ''}" data-act="select-page">${icon('tick')}</div><div></div><div>Select All (${S.sel.size}/${items.length} selected)</div><div>Source</div><div>Date</div><div>Category</div><div></div></div>
      ${slice.length ? slice.map(i => { const used = !!i.article_id, on = S.sel.has(i.url); return `<div class="disc-row ${on ? 'on' : ''} ${used ? 'used' : ''}" data-url="${esc(i.url)}">
        <div class="cb ${on ? 'on' : used ? 'dis' : ''}" data-act="pick" data-url="${esc(i.url)}">${icon('tick')}</div>
        <div class="thumb lazy-thumb ph-thumb" data-url="${esc(i.url)}" style="width:80px;height:56px;background:linear-gradient(135deg,${colorFor(i.source)[1]},${colorFor(i.source)[0]})">${esc(initials(i.source))}</div>
        <div class="dmain" style="min-width:0"><div class="dt ${mr(i.title)}" data-act="preview" data-url="${esc(i.url)}">${esc(i.title)}</div><div class="ds lazy-desc ${mr(i.excerpt)}" data-url="${esc(i.url)}">${esc(i.excerpt || '')}</div>${alsoLine(i)}${used ? `<span class="badge b-used" style="margin-top:4px">${i.article_id ? 'Already selected' : ''}</span>` : ''}</div>
        <div class="dsrc">${srcLogo(i.source, 'sm')}<span>${esc(i.source)}</span></div>
        <div class="row-meta">${fmtDate(i.date)}</div>
        <div class="dcat">${catPill(i.category)}</div>
        <div class="dact"><a class="btn sm" target="_blank" href="${esc(i.url)}">View Source</a>${used ? `<a class="btn sm soft" href="#/article/${i.article_id}">Open</a>` : `<button class="btn sm ${on ? 'primary' : ''}" data-act="pick" data-url="${esc(i.url)}">${icon('tick')}${on ? 'Selected' : 'Select'}</button>`}</div></div>`; }).join('')
      : `<div style="padding:20px">${empty('search', S.titles.items.length ? 'No articles match' : 'No news loaded yet', S.titles.items.length ? 'Try "All dates" or another source.' : 'Scan your sources to load today\'s titles.', `<button class="btn primary" data-act="scan" data-busy="Scanning…">${icon('refresh')}Scan sources now</button>`)}</div>`}
      <div style="padding:0 18px 14px">${pager(items.length, page, per, 'feed-page')}</div>
    </div>
    ${pv ? `<div class="card section preview-pane" id="pv-pane">${previewPane(pv)}</div>` : ''}
  </div>`, first);
  renderBulk();
  lazyThumbs();
  if (pv && !pv.loaded) loadPreview(pv.url);
};
function previewPane(pv) {
  const it = S.titles.items.find(i => i.url === pv.url) || {};
  const on = S.sel.has(pv.url);
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="icon-btn" data-act="preview-close">${icon('x')}</button></div>
    ${pv.image ? `<img class="pv" src="${esc(pv.image)}" alt="">` : `<div class="pv ph-thumb" style="aspect-ratio:16/10;border-radius:12px;margin-bottom:14px;background:linear-gradient(135deg,${colorFor(it.source)[1]},${colorFor(it.source)[0]});display:grid;place-items:center;font-size:28px">${esc(initials(it.source))}</div>`}
    <h3 class="${mr(it.title)}">${esc(it.title)}</h3>
    <div class="pv-meta"><div class="tcell">${srcLogo(it.source, 'sm')}<b>${esc(it.source)}</b></div><div>${icon('calendar')} ${fmtDate(it.date)}</div></div>
    <div class="pv-meta"><span>Category</span>${catPill(it.category)}</div>
    <label class="lbl">Original Source URL</label><a class="pv-url" href="${esc(it.url)}" target="_blank">${icon('link')}<span>${esc(it.url)}</span>${icon('ext')}</a>
    ${it.also?.length ? `<label class="lbl">Same news on ${it.also.length} more source${it.also.length > 1 ? 's' : ''} — the article uses all of them</label><div class="also-list">${it.also.map(o => `<a href="${esc(o.url)}" target="_blank">${srcLogo(o.source, 'sm')}<div><b>${esc(o.source)}</b><span class="${mr(o.title)}">${esc(o.title)}</span></div>${icon('ext')}</a>`).join('')}</div>` : ''}
    <label class="lbl">Source Content Preview</label>
    <div class="pv-box ${mr(pv.text)}">${pv.loaded ? (pv.error ? `<span style="color:var(--danger-ink)">${esc(pv.error)}</span>` : esc(pv.text) + (pv.words ? `\n\n… ${pv.words} words in total` : '')) : '<span class="spin"></span> Loading content…'}</div>
    <div style="display:flex;gap:10px;margin-top:16px"><a class="btn" target="_blank" href="${esc(it.url)}">Open Original Article ${icon('ext')}</a>${it.article_id ? `<a class="btn primary" style="flex:1;justify-content:center" href="#/article/${it.article_id}">Open Article</a>` : `<button class="btn primary" style="flex:1;justify-content:center" data-act="pick" data-url="${esc(it.url)}">${icon(on ? 'tick' : 'plus')}${on ? 'Selected' : 'Add to Selection'}</button>`}</div>`;
}
async function loadPreview(url) {
  try { const d = await api('/api/preview?url=' + encodeURIComponent(url)); if (S.feed.preview?.url === url) Object.assign(S.feed.preview, { loaded: true, text: d.text, words: d.words, image: d.image }); }
  catch (e) { if (S.feed.preview?.url === url) Object.assign(S.feed.preview, { loaded: true, error: e.message }); }
  const pane = $('#pv-pane'); if (pane) { pane.innerHTML = previewPane(S.feed.preview); hydrate(pane); }
}
const thumbCache = {};
function lazyThumbs() {
  $$('.lazy-thumb').forEach(async el => {
    const url = el.dataset.url;
    if (!thumbCache[url]) thumbCache[url] = api('/api/meta?url=' + encodeURIComponent(url)).catch(() => ({}));
    const m = await thumbCache[url];
    if (!el.isConnected) return;
    // swap the placeholder only once the image has loaded, so a broken image never leaves the row without its thumb cell
    if (m.image) { const img = document.createElement('img'); img.className = 'thumb'; img.style.cssText = 'width:80px;height:56px'; img.onload = () => { if (el.isConnected) el.replaceWith(img); }; img.src = m.image; }
    const d = $(`.lazy-desc[data-url="${CSS.escape(url)}"]`);
    if (d && !d.textContent.trim() && m.description) { d.textContent = m.description; d.classList.toggle('mr', isMarathi(m.description)); }
  });
}
document.addEventListener('input', e => { if (e.target.id === 'feed-q') { S.feed.q = e.target.value; S.feed.page = 1; clearTimeout(S._qt); S._qt = setTimeout(() => { ROUTES.discover(false); const q = $('#feed-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); } });
ACTIONS.pick = (el, e) => {
  e.stopPropagation();
  const item = S.titles.items.find(i => i.url === el.dataset.url);
  if (!item || item.article_id) return;
  S.sel.has(item.url) ? S.sel.delete(item.url) : S.sel.set(item.url, item);
  ROUTES.discover(false);
};
ACTIONS['select-page'] = () => {
  const items = feedItems().slice((S.feed.page - 1) * perPage('feed'), S.feed.page * perPage('feed')).filter(i => !i.article_id);
  const all = items.every(i => S.sel.has(i.url));
  items.forEach(i => all ? S.sel.delete(i.url) : S.sel.set(i.url, i));
  ROUTES.discover(false);
};
ACTIONS['feed-page'] = el => { S.feed.page = +el.dataset.p; ROUTES.discover(false); };
ACTIONS.preview = el => { S.feed.preview = { url: el.dataset.url, loaded: false }; ROUTES.discover(false); };
ACTIONS['preview-close'] = () => { S.feed.preview = null; ROUTES.discover(false); };
ACTIONS['add-selection'] = async el => {
  const items = [...S.sel.values()], process = !!el.dataset.process;
  await busy(el, async () => {
    await api('/api/select', { method: 'POST', body: { items, process } });
    toast('ok', process ? `Processing ${items.length} article${items.length > 1 ? 's' : ''} with Claude` : `${items.length} article${items.length > 1 ? 's' : ''} added to Selected Articles`);
    S.sel.clear();
    await Promise.all([loadTitles(), loadArticles()]);
  });
  location.hash = process ? '#/queue' : '#/selected';
};

// ------------------------------------------------------------------ SELECTED ARTICLES
ROUTES.selected = async function (first) {
  if (first) { await Promise.all([loadArticles(), loadState()]); S.ui.selFilter = ''; S.ui.selQ = ''; }
  const all = S.articles.filter(a => ['selected', 'extracted', 'error'].includes(a.status) && !a.has_text || ['selected', 'extracted'].includes(a.status));
  const pend = S.articles.filter(a => ['selected', 'extracted'].includes(a.status) || (a.status === 'error' && !a.has_text));
  let list = pend.filter(a => (!S.ui.selQ || a.title.toLowerCase().includes(S.ui.selQ)) && (!S.ui.selFilter || a.source.source === S.ui.selFilter));
  for (const id of [...S.asel]) if (!pend.some(a => a.id === id)) S.asel.delete(id);
  const c = S.counts;
  const srcs = [...new Set(pend.map(a => a.source.source))], cats = new Set(pend.map(a => a.source.category).filter(Boolean));
  const dates = pend.map(a => a.source.date).filter(Boolean).sort();
  const allSel = list.length && list.every(a => S.asel.has(a.id));
  paint(`
  ${pageHead({ crumb: 'Selected Articles', icon: 'file-check', color: 'g-blue', title: 'Selected Articles', sub: 'Manage selected articles, extract content and process with Claude AI for SEO-friendly posts.',
    right: `<div class="head-info">${icon('calendar')}<div><b>Today</b><span>${fmtDate(today())}</span></div></div><button class="btn" data-act="sel-clear" ${pend.length ? '' : 'disabled'}>${icon('trash')}Clear Selection</button>` })}
  <div class="kpis stagger">
    ${kpi({ g: 'blue', ic: 'file', val: pend.length, label: 'Selected Articles', note: 'Ready for processing' })}
    ${kpi({ g: 'green', ic: 'download', val: pend.filter(a => a.status === 'selected').length, label: 'Ready for Extraction', note: 'Source content not yet fetched' })}
    ${kpi({ href: '#/queue', g: 'violet', ic: 'brain', val: c.working || 0, label: 'AI Processing', note: 'Generate SEO articles' })}
    ${kpi({ href: '#/review', g: 'orange', ic: 'eye', val: (c.ready || 0) + (c.changes || 0), label: 'Ready for Review', note: 'Review and edit content' })}
    ${kpi({ href: '#/review', g: 'pink', ic: 'check', val: c.approved || 0, label: 'Approved', note: 'Ready to publish' })}
  </div>
  <div class="grid-side">
    <div>
    <div class="card section">
      <div class="toolbar inner">
        <div class="cb ${allSel ? 'on' : ''}" data-act="sel-all">${icon('tick')}</div><b>${S.asel.size || pend.length} articles selected</b>
        <div class="search-in grow" style="margin-left:10px">${icon('search')}<input class="input" id="sel-q" placeholder="Search in selected articles…" value="${esc(S.ui.selQ || '')}"></div>
        <select class="select" data-act="sel-filter"><option value="">All Sources</option>${srcs.map(s => `<option ${S.ui.selFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      </div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>#</th><th>Article title</th><th>Source</th><th>Category</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${list.map((a, i) => `<tr class="${S.asel.has(a.id) ? 'on' : ''}"><td style="width:36px"><div class="cb ${S.asel.has(a.id) ? 'on' : ''}" data-act="pick-art" data-id="${a.id}">${icon('tick')}</div></td><td class="row-meta">${i + 1}</td>
        <td><div class="tcell">${thumb(a, 'thumb')}<div><div class="t-title wrap ${mr(a.title)}">${esc(a.title)}</div>${srcCount(a)}<div class="t-sub ${mr(a.source.excerpt)}">${esc(a.source.excerpt || (a.has_text ? `${a.words || ''} source content extracted` : 'Source content not fetched yet'))}</div>${a.error ? `<div class="t-sub" style="color:var(--danger-ink)">${esc(a.error)}</div>` : ''}</div></div></td>
        <td><div class="tcell">${srcLogo(a.source.source, 'sm')}<span style="font-size:12.5px">${esc(a.source.source)}</span></div></td><td>${catPill(a.source.category)}</td><td class="row-meta">${fmtDate(a.source.date)}</td>
        <td>${a.status === 'error' ? badge('error') : a.has_text ? '<span class="badge b-extracted"><span class="bd"></span>Extracted</span>' : '<span class="badge b-selected"><span class="bd"></span>Selected</span>'}</td>
        <td><div class="acts"><a class="icon-btn" href="#/article/${a.id}" title="View">${icon('eye')}</a><button class="icon-btn red" data-act="one" data-a="delete" data-id="${a.id}" title="Remove">${icon('trash')}</button><button class="icon-btn" data-act="one" data-a="extract" data-id="${a.id}" title="Extract">${icon('download')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : empty('file-check', 'No articles selected', 'Pick news in Discover Articles and add them here.', `<a class="btn primary" href="#/discover">${icon('search')}Discover Articles</a>`)}
    </div>
    <div class="note"><div class="ic">${icon('info')}</div><div><b>Important Note</b><div style="font-size:12.5px">Articles are processed ${S.state.writers || 2} at a time. Make sure the sources are accessible and contain full content.</div></div></div>
    </div>
    <div class="card section sticky">
      <div class="section-title">Selection Summary</div><div class="section-sub" style="margin-bottom:12px">${pend.length} Articles Selected</div>
      <div class="sum-row"><div class="si" style="background:#dbeafe;color:#1d4ed8">${icon('db')}</div>Sources<div class="sv">${srcs.length} different sources</div></div>
      <div class="sum-row"><div class="si" style="background:#ede9fe;color:#6d28d9">${icon('tagi')}</div>Categories<div class="sv">${cats.size} categories</div></div>
      <div class="sum-row"><div class="si" style="background:#d1fae5;color:#047857">${icon('calendar')}</div>Date Range<div class="sv">${dates.length ? (dates[0] === dates.at(-1) ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates.at(-1))}`) : '—'}</div></div>
      <div class="sum-row"><div class="si" style="background:#ffedd5;color:#c2410c">${icon('clock')}</div>Estimated Processing Time<div class="sv">${pend.length ? `${Math.ceil(pend.length / (S.state.writers || 2)) * 3}–${Math.ceil(pend.length / (S.state.writers || 2)) * 5} minutes` : '—'}</div></div>
      <div class="section-title" style="font-size:14px;margin:16px 0 4px">Next Steps</div>
      <div class="steps-v">
        <div class="step-v ${pend.length && pend.every(a => a.has_text) ? 'done' : ''}"><div class="n">1</div><div><b>Extract Source Content</b><span>Fetch full article content from original URLs</span></div></div>
        <div class="step-v"><div class="n">2</div><div><b>Process with Claude AI</b><span>Generate SEO-friendly articles</span></div></div>
        <div class="step-v"><div class="n">3</div><div><b>Review &amp; Edit</b><span>Check and modify generated content</span></div></div>
        <div class="step-v"><div class="n">4</div><div><b>Publish to WordPress</b><span>Manually publish approved articles</span></div></div>
      </div>
      <div style="display:grid;gap:10px;margin-top:16px">
        <button class="btn primary tall" data-act="sel-run" data-a="extract" data-busy="Extracting…" ${pend.length ? '' : 'disabled'}><span>${icon('download')} Extract Selected Articles</span><small>Fetch full content from source websites</small></button>
        <button class="btn violet tall" data-act="sel-run" data-a="process" ${pend.length ? '' : 'disabled'}><span>${icon('brain')} Process with Claude AI</span><small>Generate SEO articles (extracts first if needed)</small></button>
        <a class="btn soft tall" href="#/queue"><span>${icon('play')} Move to Processing Queue</span><small>See articles that are being written</small></a>
      </div>
    </div>
  </div>`, first);
  renderBulk();
  const q = $('#sel-q'); if (q) q.oninput = e => { S.ui.selQ = e.target.value.toLowerCase(); clearTimeout(S._st); S._st = setTimeout(() => { ROUTES.selected(false); const x = $('#sel-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
};
ACTIONS['pick-art'] = (el, e) => { e.stopPropagation(); const id = el.dataset.id; S.asel.has(id) ? S.asel.delete(id) : S.asel.add(id); rerender(); renderBulk(); };
ACTIONS['sel-all'] = () => { const pend = S.articles.filter(a => ['selected', 'extracted'].includes(a.status) || (a.status === 'error' && !a.has_text)); const all = pend.every(a => S.asel.has(a.id)); pend.forEach(a => all ? S.asel.delete(a.id) : S.asel.add(a.id)); rerender(); renderBulk(); };
ACTIONS['sel-run'] = el => { const pend = S.articles.filter(a => ['selected', 'extracted'].includes(a.status) || (a.status === 'error' && !a.has_text)); const ids = S.asel.size ? [...S.asel] : pend.map(a => a.id); return runBulk(el.dataset.a, ids, el).then(() => { if (el.dataset.a === 'process') location.hash = '#/queue'; }); };
ACTIONS['sel-clear'] = async el => { const pend = S.articles.filter(a => ['selected', 'extracted'].includes(a.status)); await runBulk('delete', pend.map(a => a.id), el); };

// ------------------------------------------------------------------ PROCESSING QUEUE
ROUTES.queue = async function (first) {
  if (first) { await Promise.all([loadArticles(), loadState()]); S.ui.qTab = 'all'; S.ui.qQ = ''; }
  const inQ = S.articles.filter(a => ['queued', 'writing', 'paused', 'error'].includes(a.status) || (a.finished && Date.now() - new Date(a.finished) < 36e5 && ['ready', 'approved', 'draft'].includes(a.status)));
  const groups = { all: inQ, processing: inQ.filter(a => a.status === 'writing'), completed: inQ.filter(a => ['ready', 'approved', 'draft'].includes(a.status)), waiting: inQ.filter(a => ['queued', 'paused'].includes(a.status)), failed: inQ.filter(a => a.status === 'error') };
  const rows = (groups[S.ui.qTab] || inQ).filter(a => !S.ui.qQ || a.title.toLowerCase().includes(S.ui.qQ));
  for (const id of [...S.asel]) if (!inQ.some(a => a.id === id)) S.asel.delete(id);
  const cur = groups.processing[0];
  const curLog = cur ? byId(cur.id) : null;
  const STEPS = ['Article added to queue', 'Source content extracted', 'Content cleaned and formatted', 'Sending to Claude AI', 'Claude AI processing…', 'Generating SEO structure…', 'Creating meta data…', 'Finalizing article…'];
  paint(`
  ${pageHead({ crumb: 'Processing Queue', icon: 'gear', color: 'g-violet', title: 'Processing Queue', sub: 'Track the progress of selected articles. Content will be extracted, processed with Claude AI, and prepared for review.',
    right: `<button class="btn primary lg" data-act="q-process-new">${icon('brain')}Process New Articles</button><button class="btn lg" data-act="q-pause-all">${icon('pause')}Pause All</button>` })}
  <div class="kpis stagger">
    ${kpi({ g: 'blue', ic: 'db', val: inQ.length, label: 'Total in Queue', note: `${groups.processing.length} processing` })}
    ${kpi({ g: 'green', ic: 'play', val: groups.processing.length, label: 'Processing', note: 'In progress' })}
    ${kpi({ g: 'violet', ic: 'check', val: groups.completed.length, label: 'Completed', note: 'Ready for review (last hour)' })}
    ${kpi({ g: 'orange', ic: 'clock', val: groups.waiting.length, label: 'Waiting', note: 'In queue' })}
    ${kpi({ g: 'red', ic: 'warn', val: groups.failed.length, label: 'Failed', note: groups.failed.length ? 'Needs attention' : 'No failures' })}
  </div>
  <div class="grid-side">
    <div>
      <div class="card section">
        <div class="toolbar inner"><div class="tabs">${[['all', 'All'], ['processing', 'Processing'], ['completed', 'Completed'], ['waiting', 'Waiting'], ['failed', 'Failed']].map(([k, l]) => `<button class="tab ${S.ui.qTab === k ? 'on' : ''}" data-act="q-tab" data-v="${k}">${l} (${groups[k].length})</button>`).join('')}</div>
          <div class="search-in grow">${icon('search')}<input class="input" id="q-q" placeholder="Search articles in queue…" value="${esc(S.ui.qQ)}"></div><button class="btn" data-act="q-refresh">${icon('refresh')}Refresh</button></div>
        ${rows.length ? queueTable(rows) : empty('layers', 'Nothing here', S.ui.qTab === 'all' ? 'Select articles and click “Process with Claude AI”.' : 'No articles in this state.', `<a class="btn primary" href="#/selected">${icon('file-check')}Selected Articles</a>`)}
      </div>
      <div class="grid-3">
        <div class="card section"><div class="section-title">${icon('layers')}Batch Actions</div><div class="section-sub" style="margin-bottom:12px">Perform actions on multiple articles (${S.asel.size} selected)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="bulk" data-a="pause">${icon('pause')}Pause Selected</button><button class="btn" data-act="bulk" data-a="resume">${icon('play')}Resume Selected</button><button class="btn" data-act="q-retry-failed">${icon('refresh')}Retry Failed</button><button class="btn danger" data-act="bulk" data-a="delete">${icon('trash')}Remove Selected</button></div></div>
        <div class="card info-card info-blue"><div class="ic">${icon('gear')}</div><div><b>Processing Settings</b><p>Configure the AI model, parallel writers and article structure.</p><a class="link" href="#/claude">Open Settings →</a></div></div>
        <div class="card info-card info-green"><div class="ic">${icon('bulb')}</div><div><b>Tip</b><p>You can continue working on other sections while articles are processing in the background.</p><a class="link" href="#/automation">View Automation →</a></div></div>
      </div>
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-head"><div class="section-title">Current Processing</div>${cur ? '<span class="badge b-live"><span class="bd"></span>Running</span>' : '<span class="badge b-off">Idle</span>'}</div>
        ${cur ? `<div class="tcell" style="margin-bottom:14px">${thumb(cur, 'thumb lg')}<div><div class="row-title ${mr(cur.title)}" style="white-space:normal">${esc(cur.title)}</div><div class="row-meta">${esc(cur.source.source)} · ${esc(cur.source.category || '')}</div></div></div>
          <div class="tcell" style="margin-bottom:10px"><div class="src-logo" style="background:#ede9fe;color:#6d28d9">${icon('brain')}</div><div><div class="row-meta">Processing Stage</div><b>${stageOf(cur)[0] === 'Claude AI' ? 'Claude AI Processing' : stageOf(cur)[0]}</b><div class="row-meta">${cur.step === 'fetching' ? 'Reading the source article…' : cur.step === 'uploading' ? 'Sending draft to WordPress…' : 'Generating SEO-friendly article with Claude AI…'}</div></div></div>
          <div class="prog-cell"><div class="progress wide live"><i style="width:${stageOf(cur)[1]}%"></i></div>${stageOf(cur)[1]}%</div>
          <div class="sum-row" style="margin-top:8px">${icon('clock')}Started at<div class="sv">${fmtDT(cur.started)}</div></div><div class="sum-row">${icon('clock')}Estimated time<div class="sv">2–5 minutes</div></div>`
        : `<div class="empty" style="padding:24px 10px">No article is being written right now.</div>`}
      </div>
      <div class="card section"><div class="section-head"><div class="section-title">Processing Logs</div>${cur ? `<a class="link" href="#/article/${cur.id}">View All</a>` : ''}</div>
        <div class="timeline">${(curLog?.log || []).slice(-6).map(l => `<div class="tl ${l.level}"><div class="td"></div><time>${fmtTime(l.t)}</time><span>${esc(l.msg)}</span></div>`).join('')}
        ${cur ? STEPS.slice(4).map(s => `<div class="tl pending"><div class="td"></div><time></time><span>${s}</span></div>`).join('') : '<div class="row-meta">Logs appear here while an article is processing.</div>'}</div>
      </div>
    </div>
  </div>`, first);
  renderBulk();
  const q = $('#q-q'); if (q) q.oninput = e => { S.ui.qQ = e.target.value.toLowerCase(); clearTimeout(S._qq); S._qq = setTimeout(() => { ROUTES.queue(false); const x = $('#q-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
};
ACTIONS['q-tab'] = el => { S.ui.qTab = el.dataset.v; ROUTES.queue(false); };
ACTIONS['q-refresh'] = async () => { await loadArticles(); ROUTES.queue(false); toast('info', 'Queue refreshed'); };
ACTIONS['q-pause-all'] = el => runBulk('pause', S.articles.filter(a => a.status === 'queued').map(a => a.id), el);
ACTIONS['q-retry-failed'] = el => runBulk('retry', S.articles.filter(a => a.status === 'error').map(a => a.id), el);
ACTIONS['q-process-new'] = el => { const ids = S.articles.filter(a => ['selected', 'extracted', 'paused'].includes(a.status)).map(a => a.id); if (!ids.length) { location.hash = '#/discover'; return; } return runBulk('process', ids, el); };
