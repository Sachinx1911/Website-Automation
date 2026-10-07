/* Pages: Article Scheduling, Help & Support */

// ------------------------------------------------------------------ ARTICLE SCHEDULING
ROUTES.scheduling = async function (first) {
  if (first) { await Promise.all([loadArticles(), loadState(), loadWp()]); const n = new Date(); S.ui.calY = n.getFullYear(); S.ui.calM = n.getMonth(); }
  const sched = S.articles.filter(a => a.status === 'scheduled').sort((a, b) => (a.scheduled_for || '').localeCompare(b.scheduled_for || ''));
  const approved = S.articles.filter(a => a.status === 'approved');
  const published = S.articles.filter(a => a.status === 'published');
  const t = today(), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const y = S.ui.calY, m = S.ui.calM, firstDay = new Date(y, m, 1), startDow = (firstDay.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d).toLocaleDateString('en-CA'));
  while (cells.length % 7) cells.push(null);
  const evFor = day => [...sched.filter(a => (a.scheduled_for || '').slice(0, 10) === day).map(a => ({ a, cls: '' })), ...published.filter(a => (a.published_at || '').slice(0, 10) === day).map(a => ({ a, cls: 'pub' }))];
  paint(`
  ${pageHead({ crumb: 'Article Scheduling', icon: 'calendar', color: 'g-blue', title: 'Article Scheduling', sub: 'Plan when approved articles go live on WordPress. Scheduled posts are created on your site and published automatically by WordPress.',
    right: `<button class="btn lg" data-act="sch-batch" ${approved.length && S.state.wp_ready ? '' : 'disabled'}>${icon('clock')}Schedule Approved (${approved.length})</button><a class="btn primary lg" href="#/review">${icon('check')}Review Center</a>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'blue', ic: 'calendar', val: sched.length, label: 'Scheduled', note: 'waiting on WordPress' })}
    ${kpi({ g: 'green', ic: 'clock', val: sched.filter(a => (a.scheduled_for || '').startsWith(t)).length, label: 'Publishing Today', note: 'go live today' })}
    ${kpi({ g: 'violet', ic: 'layers', val: sched.filter(a => (a.scheduled_for || '').slice(0, 10) <= week).length, label: 'Next 7 Days', note: 'in the coming week' })}
    ${kpi({ href: '#/review', g: 'orange', ic: 'check', val: approved.length, label: 'Approved, Not Scheduled', note: 'ready to be planned' })}
  </div>
  ${!S.state.wp_ready ? `<div class="alert warn">${icon('alert')}<div><b>WordPress is not connected.</b> Scheduling creates the post on your site, so <a class="link" href="#/wordpress">connect WordPress</a> first.</div></div>` : ''}
  <div class="grid-side" style="grid-template-columns:minmax(0,1fr) 380px">
    <div class="card section">
      <div class="section-head"><div class="section-title">${firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div><div class="acts"><button class="icon-btn" data-act="cal-nav" data-d="-1">${icon('back')}</button><button class="btn sm" data-act="cal-today">Today</button><button class="icon-btn" data-act="cal-nav" data-d="1">${icon('arrow')}</button></div></div>
      <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="wd">${d}</div>`).join('')}
        ${cells.map(day => day ? `<div class="d ${day === t ? 'today' : ''}"><b>${+day.slice(8)}</b>${evFor(day).slice(0, 3).map(({ a, cls }) => `<div class="ev ${cls} ${mr(a.title)}" data-href="#/review/${a.id}" title="${esc(a.title)}">${fmtTime(a.scheduled_for || a.published_at)} ${esc(a.title)}</div>`).join('')}${evFor(day).length > 3 ? `<div class="row-meta">+${evFor(day).length - 3} more</div>` : ''}</div>` : '<div class="d other"></div>').join('')}</div>
      <div class="row-meta" style="margin-top:10px;display:flex;gap:14px"><span><span class="dot" style="background:#0E7490;box-shadow:none"></span>Scheduled</span><span><span class="dot" style="background:#047857;box-shadow:none"></span>Published</span></div>
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-head"><div class="section-title">Upcoming</div><span class="count-pill">${sched.length}</span></div>
        ${sched.length ? sched.slice(0, 8).map(a => `<div class="row-item">${thumb(a, 'thumb sm')}<div class="row-main"><div class="row-title ${mr(a.title)}">${esc(a.title)}</div><div class="row-meta">${fmtDT(a.scheduled_for)}</div></div><div class="acts"><button class="icon-btn blue" data-act="wp-schedule" data-id="${a.id}" title="Reschedule">${icon('calendar')}</button><button class="icon-btn green" data-act="one" data-a="publish" data-id="${a.id}" title="Publish now">${icon('rocket')}</button></div></div>`).join('')
        : empty('calendar', 'Nothing scheduled', 'Approve an article and pick a date from the Review Center or WordPress page.')}</div>
      <div class="card section"><div class="section-title" style="margin-bottom:8px">How scheduling works</div><div class="check-list">${['You pick a date and time (site timezone)', 'The post is created on WordPress with status “Scheduled”', 'WordPress publishes it automatically — the dashboard does not need to be open', 'Reschedule or publish immediately any time'].map(x => `<div class="ok">${icon('check')}<span>${x}</span></div>`).join('')}</div></div>
    </div>
  </div>`, first);
};
ACTIONS['cal-nav'] = el => { let m = S.ui.calM + (+el.dataset.d), y = S.ui.calY; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } S.ui.calM = m; S.ui.calY = y; ROUTES.scheduling(false); };
ACTIONS['cal-today'] = () => { const n = new Date(); S.ui.calM = n.getMonth(); S.ui.calY = n.getFullYear(); ROUTES.scheduling(false); };
ACTIONS['sch-batch'] = () => {
  const approved = S.articles.filter(a => a.status === 'approved');
  const def = new Date(Date.now() + 36e5 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const m = modal(`<h3>Schedule ${approved.length} approved article${approved.length > 1 ? 's' : ''}</h3><p>Posts are spread out starting from the first time, one every interval.</p>
    <div class="field-row"><div class="field"><label>First publish time</label><input class="input" type="datetime-local" id="sb-start" value="${def}"></div><div class="field"><label>Interval</label><select class="select" id="sb-gap" style="width:100%">${[[30, 'Every 30 minutes'], [60, 'Every hour'], [120, 'Every 2 hours'], [180, 'Every 3 hours'], [1440, 'One per day']].map(([v, l]) => `<option value="${v}" ${v === 120 ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="sample">${approved.map((a, i) => `<div class="row-item"><span class="row-meta" style="width:22px">${i + 1}.</span><div class="row-main"><div class="row-title ${mr(a.title)}">${esc(a.title)}</div></div></div>`).join('')}</div>
    <div class="mbtns"><button class="btn" data-x>Cancel</button><button class="btn primary" id="sb-ok" data-busy="Scheduling…">${icon('calendar')}Schedule all</button></div>`);
  $('[data-x]', m).onclick = closeModal;
  $('#sb-ok', m).onclick = () => busy($('#sb-ok', m), async () => {
    const start = new Date($('#sb-start', m).value).getTime(), gap = +$('#sb-gap', m).value * 60e3;
    let done = 0;
    for (const [i, a] of approved.entries()) {
      const when = new Date(start + i * gap - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 19);
      const r = await api('/api/articles/bulk', { method: 'POST', body: { action: 'schedule', ids: [a.id], when } });
      done += r.done.length; r.failed.forEach(f => toast('err', 'Could not schedule', f.error));
    }
    closeModal(); toast('ok', `${done} article${done > 1 ? 's' : ''} scheduled`);
    await Promise.all([loadArticles(), loadWp()]); ROUTES.scheduling(false);
  });
};

// ------------------------------------------------------------------ HELP & SUPPORT
ROUTES.help = async function (first) {
  if (first) await Promise.all([loadState(), loadClaude(), loadWp()]);
  const steps = [['Sources', 'Add or enable the websites to scan.', '#/sources', 'bank'], ['Discover Articles', 'Scan and pick today\'s news.', '#/discover', 'search'], ['Selected Articles', 'Extract the source content.', '#/selected', 'file-check'], ['Processing Queue', 'Claude writes the Marathi article.', '#/queue', 'brain'], ['Review Center', 'Read, edit, check SEO and approve.', '#/review', 'check'], ['WordPress', 'Publish or schedule — only after approval.', '#/wordpress', 'wp'], ['Published Articles', 'Track what is live.', '#/published', 'news']];
  const faqs = [['Does anything publish automatically?', 'No. Articles reach WordPress as drafts or scheduled posts only when you click Publish/Schedule, or when you create an Automation Rule that explicitly publishes approved articles.'], ['Why is the Claude step slow?', 'Each article takes 2–5 minutes. Claude Code runs on this laptop using your subscription; you can raise “Parallel writers” in Claude Configuration → Advanced.'], ['A source shows “Error”. What now?', 'Open Sources and press the play icon to rescan it. The error text explains the cause (site down, blocked, or changed layout). You can also edit the URL and run Test Connection.'], ['Can I change how articles are written?', 'Yes — Claude Configuration holds the prompt templates, structure switches and writing style. Use “Test Prompt” to try changes on a real news item before saving.'], ['Where is my data stored?', 'Everything lives in this project folder on your laptop (ca_articles/, settings.json, sources.json, rules.json). Use Settings → Data & Backup to download a ZIP.'], ['How do I log in to Claude again?', 'Open the Terminal app and run: claude auth login — then press “Check again” in Claude Configuration.']];
  const shortcuts = [['Ctrl / ⌘ + K', 'Focus global search'], ['Esc', 'Close dialogs and menus'], ['Enter in Add Source URL', 'Test the connection']];
  paint(`
  ${pageHead({ crumb: 'Help & Support', icon: 'info', color: 'g-blue', title: 'Help & Support', sub: 'How CurrentFlow AI works, step by step, plus answers to common questions.',
    right: `<a class="btn lg" href="#/logs">${icon('list')}Activity Logs</a><a class="btn primary lg" href="/api/export/backup">${icon('download')}Download Backup</a>` })}
  <div class="card section" style="margin-bottom:18px"><div class="section-title" style="margin-bottom:12px">The workflow</div>
    <div class="wf">${steps.map(([n], i) => `${i ? icon('arrow') : ''}<span class="st">${n}</span>`).join('')}<span>${icon('arrow')}</span><span class="st" style="background:var(--success-soft);color:var(--success-ink)">Live on ${esc((S.state.wp_url || curSite()?.url || 'your website').replace(/^https?:\/\//, ''))}</span></div>
    <div class="row-meta" style="margin-top:10px">AI does the heavy work; a human approves every publication.</div></div>
  <div class="grid-side" style="grid-template-columns:minmax(0,1fr) 360px">
    <div class="stack">
      <div class="card section"><div class="section-title" style="margin-bottom:12px">Quick start</div>
        <div class="steps-v">${steps.map(([n, d, h, ic], i) => `<div class="step-v"><div class="n">${i + 1}</div><div style="flex:1"><b>${n}</b><span>${d}</span></div><a class="btn sm" href="${h}">${icon(ic)}Open</a></div>`).join('')}</div></div>
      <div class="card section faq"><div class="section-title" style="margin-bottom:6px">Frequently asked questions</div>${faqs.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-title" style="margin-bottom:10px">System status</div>
        <div class="sum-row">${icon('wp')}WordPress<div class="sv">${S.state.wp_ready ? '<span class="badge b-live">Connected</span>' : '<a class="badge b-failed" href="#/wordpress">Not connected</a>'}</div></div>
        <div class="sum-row">${icon('claude')}Claude Code<div class="sv">${S.claude?.logged_in ? '<span class="badge b-live">Logged in</span>' : '<a class="badge b-failed" href="#/claude">Login needed</a>'}</div></div>
        <div class="sum-row">${icon('bank')}Sources<div class="sv">${S.state.sources_active} active${S.state.sources_errors ? ` · <span style="color:var(--danger)">${S.state.sources_errors} errors</span>` : ''}</div></div>
        <div class="sum-row">${icon('layers')}Queue<div class="sv">${S.counts.working || 0} processing</div></div></div>
      <div class="card section"><div class="section-title" style="margin-bottom:10px">Keyboard shortcuts</div>${shortcuts.map(([k, d]) => `<div class="sum-row"><code>${k}</code><div class="sv">${d}</div></div>`).join('')}</div>
      <div class="card section"><div class="section-title" style="margin-bottom:10px">Useful links</div>
        <div style="display:grid;gap:8px"><a class="btn" target="_blank" href="${esc(S.state.wp_url || '#')}/wp-admin/">${icon('ext')}WordPress admin</a><a class="btn" target="_blank" href="https://www.pib.gov.in">${icon('ext')}PIB website</a><a class="btn" target="_blank" href="https://rankmath.com/kb/">${icon('ext')}Rank Math help</a><a class="btn" href="#/settings">${icon('gear')}Settings</a></div></div>
    </div>
  </div>`, first);
};
