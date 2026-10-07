/* Pages: SEO Configuration, Automation Rules, Activity Logs, Settings */

// ------------------------------------------------------------------ SEO CONFIGURATION
ROUTES.seo = async function (first) {
  if (first) { await Promise.all([loadSettings(), api('/api/seo/overview').then(d => { S.seoOv = d; })]); S.ui.seoSec = 'meta'; S.ui.seoTop = 0; S.ui.seoDraft = JSON.parse(JSON.stringify(S.settings.seo)); S.ui.seoPrev = null; }
  const ov = S.seoOv || {}, d = S.ui.seoDraft, sample = ov.sample || { title: 'RBI announces new monetary policy measures', excerpt: 'The Reserve Bank of India has announced new monetary policy measures aimed at supporting economic growth.', slug: 'rbi-monetary-policy', source: 'PIB', keyword: 'RBI monetary policy' };
  const site = (S.state.wp_url || curSite()?.url || 'https://yourwebsite.com').replace(/^https?:\/\//, '');
  const prev = S.ui.seoPrev || { title: sample.title, description: sample.excerpt };
  const secs = [['meta', 'Meta Title & Description', 'Set default title and description rules', 'tagi'], ['keywords', 'Keywords', 'Default keywords added to every article', 'key'], ['url', 'URL Structure', 'Slug length and suffix rules', 'link'], ['image', 'Image SEO', 'Alt text for featured images', 'image'], ['links', 'Internal Linking', 'Auto-link related articles', 'globe']];
  const checks = (ov.checks || []).map(c => ({ ...c, pct: c.total ? Math.round(c.ok / c.total * 100) : 0 }));
  const body = {
    meta: `<div class="section-title" style="font-size:15px">Meta Title &amp; Description</div><div class="row-meta" style="margin-bottom:14px">Sent to Rank Math as SEO title and description when an article is published.</div>
      <div class="field"><div style="display:flex;justify-content:space-between;align-items:center"><label>Meta Title Template</label><select class="select" style="padding:5px 28px 5px 10px" data-ins="seo-title">${['{title}', '{source_name}', '{year}', '{site_name}', '{focus_keyword}'].map(v => `<option>${v}</option>`).join('')}</select></div><input class="input" id="seo-title" data-d="title_template" value="${esc(d.title_template)}"></div>
      <div class="prompt-box" style="min-height:0;margin-bottom:14px"><div class="row-meta" style="display:flex;justify-content:space-between"><span>Preview:</span><span style="color:${[...prev.title].length > d.title_limit ? 'var(--danger)' : 'var(--primary)'}">${[...prev.title].length} / ${d.title_limit}</span></div><div class="mr">${esc(prev.title)}</div></div>
      <div class="field"><div style="display:flex;justify-content:space-between;align-items:center"><label>Meta Description Template</label><select class="select" style="padding:5px 28px 5px 10px" data-ins="seo-desc">${['{excerpt}', '{title}', '{site_name}', '{focus_keyword}'].map(v => `<option>${v}</option>`).join('')}</select></div><textarea class="input" id="seo-desc" data-d="description_template" rows="2">${esc(d.description_template)}</textarea></div>
      <div class="prompt-box" style="min-height:0;margin-bottom:14px"><div class="row-meta" style="display:flex;justify-content:space-between"><span>Preview:</span><span style="color:${[...prev.description].length > d.description_limit ? 'var(--danger)' : 'var(--primary)'}">${[...prev.description].length} / ${d.description_limit}</span></div><div class="mr">${esc(prev.description)}</div></div>
      <div class="field-row"><div class="field"><label>Title Length Limit</label><input class="input" type="number" data-d="title_limit" value="${d.title_limit}"><div class="hint">Recommended: 50–60 characters</div></div><div class="field"><label>Description Length Limit</label><input class="input" type="number" data-d="description_limit" value="${d.description_limit}"><div class="hint">Recommended: 150–160 characters</div></div></div>
      <div class="section-title" style="font-size:13px;margin:6px 0">Auto Generate</div>
      ${[['auto_title', 'Automatically generate meta title'], ['auto_description', 'Automatically generate meta description'], ['add_source_name', 'Add source name to meta title'], ['add_year', 'Add current date/year to meta title']].map(([k, l]) => `<div class="switch-row"><div class="sl">${l}</div><button class="switch ${d[k] ? 'on' : ''}" data-act="seo-toggle" data-k="${k}"></button></div>`).join('')}`,
    keywords: `<div class="section-title" style="font-size:15px">Keywords</div><div class="row-meta" style="margin-bottom:14px">Claude picks the focus keyword per article. Default keywords below are added as tags to every article.</div>
      <div class="field"><label>Default keywords / tags</label><input class="input mr" data-d="default_keywords" value="${esc(d.default_keywords || '')}" placeholder="चालू घडामोडी, MPSC, current affairs 2026"><div class="hint">Comma separated.</div></div>
      <div class="section-title" style="font-size:13px;margin:6px 0 8px">Keywords used so far</div><div style="display:flex;flex-wrap:wrap;gap:6px">${(ov.keywords || []).map(k => `<span class="tag mr" style="padding:5px 10px">${esc(k)}</span>`).join('') || '<span class="row-meta">No articles yet</span>'}</div>`,
    url: `<div class="section-title" style="font-size:15px">URL Structure</div><div class="row-meta" style="margin-bottom:14px">Slugs are generated in English by Claude and trimmed with these rules.</div>
      <div class="field-row"><div class="field"><label>Maximum slug length</label><input class="input" type="number" data-d="slug_max" value="${d.slug_max}"></div><div class="field"><label>Slug suffix</label><input class="input" data-d="slug_suffix" value="${esc(d.slug_suffix || '')}" placeholder="e.g. -marathi"></div></div>
      <div class="prompt-box" style="min-height:0"><div class="row-meta">Preview</div><code>${esc(site)}/${esc((sample.slug || 'example-slug').slice(0, d.slug_max))}${esc(d.slug_suffix || '')}</code></div>`,
    image: `<div class="section-title" style="font-size:15px">Image SEO</div><div class="row-meta" style="margin-bottom:14px">Alt text given to the featured image when it is uploaded to WordPress.</div>
      <div class="field"><label>Alt text template</label><input class="input" data-d="alt_template" value="${esc(d.alt_template)}"><div class="hint">Variables: {title}, {focus_keyword}</div></div>
      <div class="prompt-box mr" style="min-height:0"><div class="row-meta">Preview</div>${esc((d.alt_template || '{title}').replace('{title}', sample.title).replace('{focus_keyword}', sample.keyword || ''))}</div>`,
    links: `<div class="section-title" style="font-size:15px">Internal Linking</div><div class="row-meta" style="margin-bottom:14px">Claude receives your 150 most recent posts and links to related ones.</div>
      <div class="switch-row"><div class="sl">Enable automatic internal links</div><button class="switch ${d.internal_links ? 'on' : ''}" data-act="seo-toggle" data-k="internal_links"></button></div>
      <div class="field" style="margin-top:14px"><label>Maximum internal links per article</label><input class="input" type="number" min="0" max="10" data-d="max_internal_links" value="${d.max_internal_links}"></div>`,
  };
  paint(`
  ${pageHead({ crumb: 'SEO Configuration', icon: 'search', color: 'g-violet', title: 'SEO Configuration', sub: 'Optimize your articles for better search engine visibility and higher rankings.',
    right: `<button class="btn lg" data-act="seo-restore">${icon('refresh')}Restore Defaults</button><button class="btn primary lg" data-act="seo-save" data-busy="Saving…">${icon('save')}Save Configuration</button>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'green', ic: 'search', val: ov.optimized ?? 0, label: 'Articles Optimized', note: `score 80+ of ${ov.total ?? 0} articles` })}
    ${kpi({ g: 'blue', ic: 'award', val: ov.avg ?? 0, label: 'Avg. SEO Score', note: 'out of 100' })}
    ${kpi({ g: 'violet', ic: 'file', val: ov.avg_words ?? 0, label: 'Avg. Words / Article', note: 'longer articles rank better' })}
    ${kpi({ g: 'orange', ic: 'link', val: checks.find(c => c.label.startsWith('Has an internal'))?.ok ?? 0, label: 'Articles with Internal Links', note: 'from generated articles' })}
  </div>
  <div class="card" style="margin-bottom:18px"><div class="editor-tabs">${[['meta', 'General Settings'], ['meta', 'Meta Configuration'], ['keywords', 'Keyword Settings'], ['url', 'URL Settings'], ['image', 'Image SEO'], ['links', 'Internal Linking']].map(([k, l], i) => `<button class="${(S.ui.seoTop ?? 0) === i ? 'on' : ''}" data-act="seo-sec" data-v="${k}" data-top="${i}">${l}</button>`).join('')}</div></div>
  <div class="grid-side" style="grid-template-columns:minmax(0,1fr) 400px">
    <div class="card section">
      <div class="section-head"><div><div class="section-title">SEO Configuration</div><div class="section-sub">Set default SEO settings for your articles. These settings will be applied automatically during article processing.</div></div><button class="btn" data-act="seo-restore">${icon('refresh')}Restore Defaults</button></div>
      <div class="seo-grid">
        <div>${secs.map(([k, l, s, ic]) => `<div class="tpl-item ${S.ui.seoSec === k ? 'on' : ''}" data-act="seo-sec" data-v="${k}"><div class="ti" style="background:var(--primary-soft);color:var(--primary)">${icon(ic)}</div><div><b>${l}</b><span>${s}</span></div></div>`).join('')}</div>
        <div>${body[S.ui.seoSec]}</div>
      </div>
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-title" style="margin-bottom:10px">SEO Preview</div><div class="tabs underline" style="margin-bottom:12px"><button class="tab on">Google</button></div>
        <div class="serp" style="font-family:arial,sans-serif"><div style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><div class="src-logo sm" style="background:#e8f0fe;color:#1a73e8;border-radius:50%">${initials(site)}</div><div><div style="font-size:13px;color:#202124">${esc(site.split('.')[0])}</div><div style="font-size:11px;color:#5f6368">https://${esc(site)}</div></div></div>
          <div class="mr" style="color:#1a0dab;font-size:18px;line-height:1.3;margin-bottom:4px">${esc(prev.title)}</div><div class="mr" style="color:#4d5156;font-size:13px;line-height:1.5">${esc(prev.description)}</div></div></div>
      <div class="card section"><div class="section-title" style="margin-bottom:10px">SEO Analysis</div><div class="score-wrap">${ring(ov.avg ?? 0)}<div class="check-list" style="flex:1">${checks.slice(0, 7).map(c => `<div class="${c.pct >= 70 ? 'ok' : 'no'}">${icon(c.pct >= 70 ? 'check' : 'alert')}<span>${esc(c.label)} <span class="row-meta">${c.pct}%</span></span></div>`).join('') || '<div class="row-meta">Generate articles to see analysis.</div>'}</div></div><div class="row-meta" style="margin-top:8px">${ov.avg >= 80 ? '<b style="color:var(--success-ink)">Excellent!</b> Your articles are well optimized.' : ov.avg >= 60 ? '<b style="color:var(--warning-ink)">Good.</b> A few checks need attention.' : 'Average across generated articles.'}</div></div>
      <div class="card section"><div class="section-head"><div class="section-title">Keyword Suggestions</div><button class="btn sm" data-act="seo-refresh">${icon('refresh')}Refresh</button></div><div style="display:flex;flex-wrap:wrap;gap:6px">${(ov.keywords || []).slice(0, 12).map(k => `<span class="tag mr" style="padding:5px 10px">${esc(k)}</span>`).join('') || '<span class="row-meta">Keywords appear after the first articles.</span>'}</div></div>
    </div>
  </div>`, first);
  $$('[data-d]').forEach(el => el.oninput = () => { const k = el.dataset.d; S.ui.seoDraft[k] = el.type === 'number' ? +el.value : el.value; clearTimeout(S._seo); S._seo = setTimeout(seoPreview, 400); });
  $$('[data-ins]').forEach(sel => sel.onchange = () => { const inp = $('#' + sel.dataset.ins); inp.value += sel.value; inp.dispatchEvent(new Event('input')); });
};
async function seoPreview() {
  const sample = S.seoOv?.sample || { title: 'RBI announces new monetary policy measures', excerpt: 'The Reserve Bank of India has announced new monetary policy measures.', source: 'PIB' };
  try { S.ui.seoPrev = await api('/api/seo/preview', { method: 'POST', body: { seo: S.ui.seoDraft, sample } }); } catch { }
  const focus = document.activeElement?.dataset?.d, pos = document.activeElement?.selectionStart;
  ROUTES.seo(false);
  if (focus) { const el = $(`[data-d="${focus}"]`); el?.focus(); try { el.setSelectionRange(pos, pos); } catch { } }
}
ACTIONS['seo-sec'] = el => { S.ui.seoSec = el.dataset.v; S.ui.seoTop = el.dataset.top !== undefined ? +el.dataset.top : ({ meta: 1, keywords: 2, url: 3, image: 4, links: 5 }[el.dataset.v] || 0); ROUTES.seo(false); };
ACTIONS['seo-toggle'] = el => { S.ui.seoDraft[el.dataset.k] = !S.ui.seoDraft[el.dataset.k]; seoPreview(); };
ACTIONS['seo-save'] = async el => { await busy(el, async () => { S.settings = await api('/api/settings', { method: 'POST', body: { seo: S.ui.seoDraft } }); }); toast('ok', 'SEO configuration saved'); };
ACTIONS['seo-restore'] = async () => { if (!await confirmBox({ title: 'Restore SEO defaults?', text: 'Templates, limits and toggles go back to their defaults.', ok: 'Restore' })) return; S.ui.seoDraft = { title_template: '{title}', description_template: '{excerpt}', title_limit: 60, description_limit: 160, auto_title: true, auto_description: true, add_source_name: false, add_year: false, default_keywords: '', slug_max: 70, slug_suffix: '', alt_template: '{title}', internal_links: true, max_internal_links: 3 }; seoPreview(); };
ACTIONS['seo-refresh'] = async () => { S.seoOv = await api('/api/seo/overview'); ROUTES.seo(false); };

// ------------------------------------------------------------------ AUTOMATION RULES
ROUTES.automation = async function (first) {
  if (first) { const d = await api('/api/rules'); S.rules = d.items; S.triggers = d.triggers; S.ractions = d.actions; await loadSources(); S.ui.ruleTab = 'all'; S.ui.ruleQ = ''; S.ui.ruleEdit = null; }
  const rules = S.rules || [], q = S.ui.ruleQ;
  const groups = { all: rules, active: rules.filter(r => r.enabled), paused: rules.filter(r => !r.enabled) };
  const list = (groups[S.ui.ruleTab] || rules).filter(r => !q || r.name.toLowerCase().includes(q));
  const edit = S.ui.ruleEdit || {};
  const TRIG_ICON = { schedule: 'clock', new_article: 'file', article_ready: 'check', article_approved: 'check', article_published: 'send', processing_failed: 'warn' };
  const ACT_ICON = { fetch: 'download', generate: 'brain', extract: 'download', publish: 'wp', draft: 'send', approve: 'check', notify: 'bell' };
  const condText = r => { const c = r.conditions || {}; const parts = []; if (c.sources?.length) parts.push(`Source: ${c.sources.map(id => (S.sources.find(s => s.id === id) || {}).name || id).join(', ')}`); if (c.category) parts.push(`Category: ${c.category}`); if (c.keywords) parts.push(`Keywords: ${c.keywords}`); if (c.min_seo) parts.push(`SEO Score > ${c.min_seo}`); if (r.trigger === 'schedule') parts.push(r.config?.time ? `Daily at ${r.config.time}` : `Every ${r.config?.minutes || 30} min`); return parts.length ? parts : ['Always']; };
  const trig = edit.trigger || 'schedule';
  paint(`
  ${pageHead({ crumb: 'Automation Rules', icon: 'bolt', color: 'g-violet', title: 'Automation Rules', sub: 'Create and manage rules to automate your current affairs workflow.',
    right: `<button class="btn lg" data-act="rule-guide">${icon('info')}Automation Guide</button><button class="btn primary lg" data-act="rule-new">${icon('plus')}Create New Rule</button>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'blue', ic: 'gear', val: rules.length, label: 'Total Rules', note: `${rules.filter(r => r.created?.slice(0, 7) === today().slice(0, 7)).length} new this month` })}
    ${kpi({ g: 'green', ic: 'play', val: groups.active.length, label: 'Active Rules', note: 'running automatically', trend: groups.active.length ? 'up' : '' })}
    ${kpi({ g: 'orange', ic: 'clock', val: groups.paused.length, label: 'Paused Rules', note: 'not running' })}
    ${kpi({ g: 'violet', ic: 'check', val: rules.reduce((s, r) => s + (r.runs || 0), 0), label: 'Actions Executed', note: 'since rules were created' })}
  </div>
  <div class="grid-side" style="grid-template-columns:minmax(0,1fr) 330px">
    <div class="card section">
      <div class="toolbar inner"><div class="tabs underline" style="margin:0;border:0">${[['all', 'All Rules'], ['active', 'Active'], ['paused', 'Paused']].map(([k, l]) => `<button class="tab ${S.ui.ruleTab === k ? 'on' : ''}" data-act="rule-tab" data-v="${k}">${l} (${groups[k].length})</button>`).join('')}</div><div class="search-in grow">${icon('search')}<input class="input" id="rule-q" placeholder="Search automation rules…" value="${esc(q)}"></div></div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Rule name</th><th>Trigger</th><th>Conditions</th><th>Actions</th><th>Status</th><th>Last run</th><th>Run count</th><th></th></tr></thead><tbody>
      ${list.map((r, i) => `<tr><td class="row-meta">${i + 1}</td><td><div class="tcell"><div class="src-logo" style="background:${colorFor(r.trigger)[0]};color:${colorFor(r.trigger)[1]}">${icon(TRIG_ICON[r.trigger] || 'bolt')}</div><div><b>${esc(r.name)}</b>${r.website_id ? (S.site ? '' : `<span class="site-chip">${icon('globe')}${esc(siteById(r.website_id)?.name || r.website_id)}</span>`) : `<span class="site-chip all" title="Runs once for every website">${icon('layers')}All websites</span>`}<div class="t-sub">${esc(r.description || '')}</div></div></div></td>
        <td><div class="tcell" style="font-size:12.5px">${icon(TRIG_ICON[r.trigger] || 'bolt')}${esc(S.triggers[r.trigger] || r.trigger)}</div></td><td>${condText(r).map(c => `<span class="tag" style="background:#f1f5f9;color:#475569">${esc(c)}</span>`).join('')}</td>
        <td><div class="tcell" style="font-size:12.5px">${icon(ACT_ICON[r.action] || 'bolt')}${esc(S.ractions[r.action] || r.action)}</div></td>
        <td><div class="tcell"><button class="switch ${r.enabled ? 'on' : ''}" data-act="rule-toggle" data-id="${r.id}" style="width:36px;height:20px"></button>${r.enabled ? '<span class="badge b-live">Active</span>' : '<span class="badge b-ready">Paused</span>'}</div></td>
        <td class="row-meta">${r.last_run ? `${ago(r.last_run)}<br>${fmtDT(r.last_run)}${r.last_status === 'failed' ? ' <span style="color:var(--danger)">failed</span>' : ''}` : 'Never'}</td><td><b>${r.runs || 0}</b></td>
        <td><div class="acts"><button class="icon-btn blue" data-act="rule-run" data-id="${r.id}" title="Run now">${icon('play')}</button><button class="icon-btn blue" data-act="rule-edit" data-id="${r.id}" title="Edit">${icon('edit')}</button><button class="icon-btn" data-act="rule-copy" data-id="${r.id}" title="Duplicate">${icon('copy')}</button><button class="icon-btn red" data-act="rule-del" data-id="${r.id}" title="Delete">${icon('trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : empty('bolt', 'No automation rules yet', 'Create your first rule on the right — for example “Every 30 minutes → Fetch Articles”.')}
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-head"><div class="section-title">${icon('bolt')}${edit.id ? 'Edit Rule' : 'Create Automation Rule'}</div>${edit.id ? `<button class="icon-btn" data-act="rule-new">${icon('x')}</button>` : ''}</div>
        <form id="rule-form">
          <div class="field"><label>Rule Name</label><input class="input" name="name" required placeholder="Enter rule name…" value="${esc(edit.name || '')}"></div>
          <div class="field"><label>Select Trigger</label><select class="select" name="trigger" id="rule-trigger" style="width:100%">${Object.entries(S.triggers).map(([k, l]) => `<option value="${k}" ${trig === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div id="rule-cond">${ruleConditions(trig, edit)}</div>
          <div class="field"><label>Select Action</label><select class="select" name="action" style="width:100%">${Object.entries(S.ractions).map(([k, l]) => `<option value="${k}" ${(edit.action || (trig === 'schedule' ? 'fetch' : 'generate')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Description</label><input class="input" name="description" placeholder="What does this rule do?" value="${esc(edit.description || '')}"></div>
          <button class="btn primary block" data-busy="Saving…">${icon(edit.id ? 'save' : 'plus')}${edit.id ? 'Save Rule' : 'Create Rule'}</button>
        </form></div>
      <div class="card section"><div class="section-title" style="font-size:14px;margin-bottom:8px">Available Triggers</div>${Object.entries(S.triggers).map(([k, l]) => `<div class="sum-row"><div class="si" style="background:${colorFor(k)[0]};color:${colorFor(k)[1]}">${icon(TRIG_ICON[k])}</div><div><b style="font-size:12.5px">${l}</b><div class="row-meta">${{ schedule: 'Run at specific time intervals', new_article: 'When a new title is found during a scan', article_ready: 'When Claude finishes an article', article_approved: 'When an article is approved', article_published: 'When an article is published', processing_failed: 'When processing hits an error' }[k]}</div></div></div>`).join('')}</div>
      <div class="card section"><div class="section-title" style="font-size:14px;margin-bottom:8px">Available Actions</div>${Object.entries(S.ractions).map(([k, l]) => `<div class="sum-row"><div class="si" style="background:${colorFor(k + 'a')[0]};color:${colorFor(k + 'a')[1]}">${icon(ACT_ICON[k])}</div><div><b style="font-size:12.5px">${l}</b><div class="row-meta">${{ fetch: 'Scan all enabled sources', generate: 'Select, extract and write with Claude', extract: 'Fetch source content only', publish: 'Publish the article on your site', draft: 'Create a WordPress draft', approve: 'Mark the article as approved', notify: 'Write a notification to the activity log' }[k]}</div></div></div>`).join('')}</div>
    </div>
  </div>`, first);
  $('#rule-trigger').onchange = e => { $('#rule-cond').innerHTML = ruleConditions(e.target.value, {}); hydrate($('#rule-cond')); };
  const rq = $('#rule-q'); rq.oninput = e => { S.ui.ruleQ = e.target.value.toLowerCase(); clearTimeout(S._rq2); S._rq2 = setTimeout(() => { ROUTES.automation(false); const x = $('#rule-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
  $('#rule-form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target), body = { id: edit.id, name: f.get('name'), trigger: f.get('trigger'), action: f.get('action'), description: f.get('description'), enabled: edit.enabled ?? true, conditions: {}, config: {} };
    if (body.trigger === 'schedule') { body.config = f.get('mode') === 'daily' ? { time: f.get('time') || '08:00' } : { minutes: +(f.get('minutes') || 30) }; }
    else { const srcs = f.getAll('sources').filter(Boolean); if (srcs.length) body.conditions.sources = srcs; if (f.get('category')) body.conditions.category = f.get('category'); if (f.get('keywords')) body.conditions.keywords = f.get('keywords'); if (f.get('min_seo')) body.conditions.min_seo = +f.get('min_seo'); }
    busy(e.submitter, async () => { await api('/api/rules', { method: 'POST', body }); toast('ok', edit.id ? 'Rule updated' : 'Rule created', body.name); S.ui.ruleEdit = null; S.rules = (await api('/api/rules')).items; ROUTES.automation(false); });
  };
};
function ruleConditions(trig, edit) {
  const c = edit.conditions || {}, cfg = edit.config || {};
  if (trig === 'schedule') return `<div class="field"><label>Schedule</label><div class="field-row"><select class="select" name="mode" id="rule-mode" style="width:100%"><option value="interval" ${cfg.time ? '' : 'selected'}>Every N minutes</option><option value="daily" ${cfg.time ? 'selected' : ''}>Daily at time</option></select><input class="input" name="minutes" type="number" min="5" value="${cfg.minutes || 30}" placeholder="minutes"></div><input class="input" name="time" type="time" value="${cfg.time || '08:00'}" style="margin-top:8px"><div class="hint">Interval uses “minutes”; daily uses the time field.</div></div>`;
  const srcOpts = S.sources.map(s => `<option value="${s.id}" ${(c.sources || []).includes(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  return `<div class="field"><label>Conditions (optional)</label>
    ${['new_article', 'article_ready', 'article_approved', 'article_published', 'processing_failed'].includes(trig) ? `<select class="select" name="sources" multiple style="width:100%;height:84px;background-image:none;padding:6px">${srcOpts}</select><div class="hint">Hold ⌘/Ctrl to pick several sources. Empty = any source.</div>` : ''}
    <div class="field-row" style="margin-top:8px"><input class="input" name="category" placeholder="Category (e.g. National)" value="${esc(c.category || '')}"><input class="input" name="keywords" placeholder="Keywords, comma separated" value="${esc(c.keywords || '')}"></div>
    ${['article_ready', 'article_approved'].includes(trig) ? `<input class="input" name="min_seo" type="number" min="0" max="100" placeholder="Minimum SEO score (e.g. 80)" value="${c.min_seo || ''}" style="margin-top:8px">` : ''}</div>`;
}
ACTIONS['rule-tab'] = el => { S.ui.ruleTab = el.dataset.v; ROUTES.automation(false); };
ACTIONS['rule-new'] = () => { S.ui.ruleEdit = null; ROUTES.automation(false); };
ACTIONS['rule-edit'] = el => { S.ui.ruleEdit = S.rules.find(r => r.id === el.dataset.id); ROUTES.automation(false); };
ACTIONS['rule-copy'] = async el => { const r = S.rules.find(x => x.id === el.dataset.id); await api('/api/rules', { method: 'POST', body: { ...r, id: undefined, name: r.name + ' (copy)', enabled: false } }); S.rules = (await api('/api/rules')).items; toast('ok', 'Rule duplicated'); ROUTES.automation(false); };
ACTIONS['rule-toggle'] = async el => { const r = S.rules.find(x => x.id === el.dataset.id); await api('/api/rules', { method: 'POST', body: { id: r.id, enabled: !r.enabled } }); S.rules = (await api('/api/rules')).items; toast('info', `${r.name} ${r.enabled ? 'paused' : 'activated'}`); ROUTES.automation(false); };
ACTIONS['rule-del'] = async el => { const r = S.rules.find(x => x.id === el.dataset.id); if (!await confirmBox({ title: `Delete “${r.name}”?`, text: 'The rule stops running immediately.', ok: 'Delete', kind: 'danger-solid' })) return; await api(`/api/rules/${r.id}`, { method: 'DELETE' }); S.rules = (await api('/api/rules')).items; ROUTES.automation(false); };
ACTIONS['rule-run'] = async el => { const r = S.rules.find(x => x.id === el.dataset.id); el.innerHTML = '<span class="spin"></span>'; try { await api(`/api/rules/${r.id}/run`, { method: 'POST' }); toast('ok', 'Rule executed', r.name); } finally { S.rules = (await api('/api/rules')).items; ROUTES.automation(false); } };
ACTIONS['rule-guide'] = () => modal(`<h3>Automation guide</h3><p>Rules connect a <b>trigger</b> to an <b>action</b>. A good starter set:</p>
  <div class="sum-row">${icon('clock')}<div><b>Every 30 minutes → Fetch Articles</b><div class="row-meta">keeps Discover up to date</div></div></div>
  <div class="sum-row">${icon('file')}<div><b>New Article Added (PIB मराठी) → Generate AI Content</b><div class="row-meta">writes articles automatically for a trusted source</div></div></div>
  <div class="sum-row">${icon('check')}<div><b>Article Approved (SEO > 80) → Publish to WordPress</b><div class="row-meta">publishes only what you approved</div></div></div>
  <div class="sum-row">${icon('warn')}<div><b>Processing Failed → Send Notification</b><div class="row-meta">shows failures in the bell menu</div></div></div>
  <p style="margin-top:14px">Everything runs while the dashboard is open on this laptop. Use “Run now” to test a rule immediately.</p><div class="mbtns"><button class="btn primary" onclick="closeModal()">Got it</button></div>`);

// ------------------------------------------------------------------ ACTIVITY LOGS
ROUTES.logs = async function (first) {
  if (first) { S.ui.logDays = 7; S.ui.logQ = ''; S.ui.logUser = ''; S.ui.logMod = ''; S.ui.logStatus = ''; S.ui.logPage = 1; S.logs = (await api(`/api/logs?days=${S.ui.logDays}`)).items; }
  const all = S.logs || [];
  const list = all.filter(e => (!S.ui.logQ || `${e.user} ${e.action} ${e.details}`.toLowerCase().includes(S.ui.logQ)) && (!S.ui.logUser || e.user === S.ui.logUser) && (!S.ui.logMod || e.module === S.ui.logMod) && (!S.ui.logStatus || e.status === S.ui.logStatus));
  const sorted = sortList('log', list, { t: e => e.t, user: e => e.user, action: e => e.action, module: e => e.module, status: e => e.status }); list.splice(0, list.length, ...sorted);
  const per = perPage('log'), page = Math.min(S.ui.logPage, Math.max(1, Math.ceil(list.length / per))), slice = list.slice((page - 1) * per, page * per);
  const users = [...new Set(all.map(e => e.user))], mods = [...new Set(all.map(e => e.module))];
  const byMod = {}; all.forEach(e => byMod[e.module] = (byMod[e.module] || 0) + 1);
  const modList = Object.entries(byMod).sort((a, b) => b[1] - a[1]);
  const total = all.length || 1;
  let acc = 0; const conic = modList.map(([m, n], i) => { const from = acc / total * 100; acc += n; return `${PALETTE[i % PALETTE.length][1]} ${from}% ${acc / total * 100}%`; }).join(', ');
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toLocaleDateString('en-CA'); });
  const perDay = days.map(d => all.filter(e => e.t.startsWith(d)).length), maxDay = Math.max(1, ...perDay);
  const user = all.filter(e => e.user === 'You').length, sys = all.filter(e => e.user === 'System').length, errs = all.filter(e => e.status === 'failed').length;
  const content = all.filter(e => ['Articles', 'WordPress'].includes(e.module)).length;
  const MODC = m => { const [bg, fg] = colorFor(m); return `<span class="cat" style="background:${bg};color:${fg}">${esc(m)}</span>`; };
  paint(`
  ${pageHead({ crumb: 'Activity Logs', icon: 'list', color: 'g-violet', title: 'Activity Logs', sub: 'Track all system activities, actions and changes across your Current Affairs platform.',
    right: `<a class="btn lg" href="/api/logs/export?days=${S.ui.logDays}&website=${encodeURIComponent(S.site || 'all')}">${icon('download')}Export Logs</a><select class="select" id="log-days" style="padding:12px 36px 12px 14px">${[[1, 'Today'], [7, 'Last 7 Days'], [30, 'Last 30 Days'], [0, 'All time']].map(([v, l]) => `<option value="${v}" ${S.ui.logDays == v ? 'selected' : ''}>${l}</option>`).join('')}</select>` })}
  <div class="kpis stagger">
    ${kpi({ g: 'violet', ic: 'file', val: all.length, label: 'Total Activities', note: S.ui.logDays ? `last ${S.ui.logDays} day${S.ui.logDays > 1 ? 's' : ''}` : 'all time' })}
    ${kpi({ g: 'green', ic: 'eye', val: user, label: 'User Actions', note: 'done from this dashboard' })}
    ${kpi({ g: 'blue', ic: 'gear', val: sys, label: 'System Events', note: 'automation & background work' })}
    ${kpi({ g: 'orange', ic: 'db', val: content, label: 'Content Operations', note: 'articles & WordPress' })}
    ${kpi({ g: 'red', ic: 'shield', val: errs, label: 'Errors / Failures', note: errs ? 'needs attention' : 'no failures', trend: errs ? 'down' : '' })}
  </div>
  <div class="card toolbar"><div class="search-in grow">${icon('search')}<input class="input" id="log-q" placeholder="Search logs (user, action, details)…" value="${esc(S.ui.logQ)}"></div>
    <select class="select" id="log-user"><option value="">All Users</option>${users.map(u => `<option ${S.ui.logUser === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
    <select class="select" id="log-mod"><option value="">All Modules</option>${mods.map(m => `<option ${S.ui.logMod === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    <select class="select" id="log-status"><option value="">All Status</option><option value="success" ${S.ui.logStatus === 'success' ? 'selected' : ''}>Success</option><option value="failed" ${S.ui.logStatus === 'failed' ? 'selected' : ''}>Failed</option></select>
    <button class="btn" data-act="log-clear">${icon('x')}Clear Filters</button></div>
  <div class="grid-side" style="grid-template-columns:minmax(0,1fr) 340px">
    <div class="card section">
      ${slice.length ? `<div class="table-wrap"><table><thead><tr><th>#</th>${th('log', 't', 'Date &amp; time')}${th('log', 'user', 'User')}${th('log', 'action', 'Action')}${th('log', 'module', 'Module')}<th>Details</th>${th('log', 'status', 'Status')}<th>Source</th><th></th></tr></thead><tbody>
      ${slice.map((e, i) => `<tr><td class="row-meta">${(page - 1) * per + i + 1}</td><td class="row-meta">${fmtDate(e.t)}<br>${fmtTime(e.t)}</td><td><div class="tcell"><div class="src-logo sm" style="background:${e.user === 'System' ? '#eff6ff' : '#ede9fe'};color:${e.user === 'System' ? '#1d4ed8' : '#6d28d9'}">${e.user === 'System' ? icon('gear') : initials(S.wp?.user?.name || 'You')}</div><div><b>${esc(e.user === 'You' ? (S.wp?.user?.name || 'You') : e.user)}</b><div class="row-meta">${e.user === 'System' ? 'Automation' : 'Admin'}</div></div></div></td>
        <td><b style="font-size:12.5px">${esc(e.action)}</b></td><td>${MODC(e.module)}</td><td class="row-meta mr" style="max-width:300px">${!S.site && e.website_id ? `<span class="site-chip">${icon('globe')}${esc(siteById(e.website_id)?.name || e.website_id)}</span>` : ''}${esc(e.details)}</td><td>${e.status === 'failed' ? '<span class="badge b-failed"><span class="bd"></span>Failed</span>' : '<span class="badge b-live"><span class="bd"></span>Success</span>'}</td><td class="row-meta">${e.user === 'System' ? 'Scheduler' : '127.0.0.1'}</td><td>${e.article_id ? `<a class="icon-btn" href="#/article/${e.article_id}">${icon('eye')}</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${pager(list.length, page, per, 'log-page')}` : empty('list', 'No activity yet', 'Actions you take in the dashboard appear here.')}
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-head"><div class="section-title">Activity Overview</div><span class="row-meta">Last 7 days</span></div>
        <div style="display:flex;gap:6px;align-items:flex-end;height:120px;margin-top:8px">${perDay.map((n, i) => `<div style="flex:1;text-align:center"><div style="height:${Math.max(4, n / maxDay * 96)}px;background:linear-gradient(180deg,#60a5fa,#2563eb);border-radius:6px 6px 2px 2px;transition:height .6s" title="${n}"></div><div class="row-meta" style="font-size:10px;margin-top:4px">${days[i].slice(5).replace('-', '/')}</div></div>`).join('')}</div></div>
      <div class="card section"><div class="section-title" style="margin-bottom:10px">Activity by Module</div>
        <div style="display:flex;gap:16px;align-items:center"><div style="width:110px;height:110px;border-radius:50%;background:conic-gradient(${conic || '#e2e8f0 0 100%'});display:grid;place-items:center;flex:none"><div style="width:72px;height:72px;border-radius:50%;background:var(--panel);display:grid;place-items:center;text-align:center;line-height:1.1"><b style="font-size:16px">${all.length}</b><span class="row-meta" style="font-size:10px">Total</span></div></div>
        <div style="flex:1">${modList.map(([m, n], i) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span><span class="dot" style="background:${PALETTE[i % PALETTE.length][1]};box-shadow:none"></span>${esc(m)}</span><b>${Math.round(n / total * 100)}%</b></div>`).join('') || '<span class="row-meta">No data</span>'}</div></div></div>
      <div class="card section"><div class="section-head"><div class="section-title">Recent Activities</div></div>${all.slice(0, 6).map(e => `<div class="row-item"><div class="src-logo sm" style="background:${e.status === 'failed' ? '#fee2e2' : colorFor(e.module)[0]};color:${e.status === 'failed' ? '#b91c1c' : colorFor(e.module)[1]}">${icon(e.status === 'failed' ? 'warn' : 'check')}</div><div class="row-main"><div class="row-title" style="font-size:12.5px">${esc(e.action)}</div><div class="row-meta mr" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.details)}</div></div><span class="row-meta" style="white-space:nowrap">${ago(e.t)}</span></div>`).join('')}</div>
    </div>
  </div>`, first);
  const reload = async () => { S.logs = (await api(`/api/logs?days=${S.ui.logDays}`)).items; S.ui.logPage = 1; ROUTES.logs(false); };
  $('#log-days').onchange = e => { S.ui.logDays = +e.target.value; reload(); };
  $('#log-q').oninput = e => { S.ui.logQ = e.target.value.toLowerCase(); S.ui.logPage = 1; clearTimeout(S._lq); S._lq = setTimeout(() => { ROUTES.logs(false); const x = $('#log-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
  [['#log-user', 'logUser'], ['#log-mod', 'logMod'], ['#log-status', 'logStatus']].forEach(([id, k]) => $(id).onchange = e => { S.ui[k] = e.target.value; S.ui.logPage = 1; ROUTES.logs(false); });
};
ACTIONS['log-page'] = el => { S.ui.logPage = +el.dataset.p; ROUTES.logs(false); };
ACTIONS['log-clear'] = () => { Object.assign(S.ui, { logQ: '', logUser: '', logMod: '', logStatus: '', logPage: 1 }); ROUTES.logs(false); };

// ------------------------------------------------------------------ SETTINGS
ROUTES.settings = async function (first) {
  if (first) { await Promise.all([loadSettings(), loadState(), loadWp(), loadClaude(), S.state.wp_ready ? api('/api/wordpress/lists').then(d => { S.wpLists = d; }).catch(() => {}) : null]); S.ui.setTab = 'general'; }
  const s = S.settings, wp = S.wp || {}, c = S.claude || {};
  const sw = (key, on) => `<button class="switch ${on ? 'on' : ''}" data-act="set-toggle" data-key="${key}"></button>`;
  const row = (key, on, title, sub) => `<div class="switch-row">${sw(key, on)}<div style="flex:1;margin-left:4px"><b style="font-size:13px">${title}</b><div class="row-meta">${sub}</div></div></div>`;
  const head = (ic, g, t, sub) => `<div class="tcell" style="margin-bottom:14px"><div class="kpi-icon g-${g}" style="width:44px;height:44px;border-radius:12px">${icon(ic)}</div><div><b style="font-size:15px">${t}</b><div class="row-meta">${sub}</div></div></div>`;
  paint(`
  ${pageHead({ crumb: 'Settings', icon: 'gear', color: 'g-violet', title: 'Settings', sub: 'Manage your account, preferences, integrations and system configuration.' })}
  <div class="alert info" style="margin-bottom:14px">${icon('globe')}<div>${curSite() ? `Publishing, SEO, content and quick-action settings changed here apply to <b>${esc(curSite().name)}</b> only. Everything else is shared by all websites.` : 'All Websites: changes here are the defaults for every website. Pick a website in the top bar to change its own publishing, SEO and content settings.'}</div></div>
  <div class="card" style="margin-bottom:18px"><div class="editor-tabs">${[['general', 'gear', 'General'], ['account', 'eye', 'Account'], ['integrations', 'link', 'Integrations'], ['notifications', 'bell', 'Notifications'], ['system', 'cpu', 'System'], ['data', 'db', 'Data & Backup']].map(([k, ic, l]) => `<button class="${S.ui.setTab === k ? 'on' : ''}" data-act="set-tab" data-v="${k}">${icon(ic)} ${l}</button>`).join('')}</div></div>
  ${S.ui.setTab === 'account' ? `<div class="grid-3" style="margin-top:0;align-items:start">
    <div class="card section">${head('eye', 'blue', 'Profile', 'Shown in the top bar and greetings.')}<div class="field"><label>Your name</label><input class="input" data-set="app.user_name" value="${esc(s.app.user_name || '')}"></div><div class="field"><label>Role</label><input class="input" value="Admin" disabled></div><div class="field"><label>Email</label><input class="input" value="${esc(wp.user?.email || '—')}" disabled><div class="hint">From the connected WordPress user.</div></div></div>
    <div class="card section">${head('key', 'violet', 'WordPress login', 'Application password stored locally.')}<div class="kv-grid"><dt>Username</dt><dd>${esc(wp.user_login || '—')}</dd><dt>Password</dt><dd>${wp.has_password ? 'Saved in .env' : 'Not set'}</dd></div><button class="btn" data-act="wp-connect-modal" style="margin-top:12px">${icon('key')}Change</button></div>
    <div class="card section">${head('spark', 'orange', 'Claude account', 'Claude Code login on this laptop.')}<div class="kv-grid"><dt>Status</dt><dd>${c.logged_in ? 'Logged in' : 'Not logged in'}</dd><dt>Plan</dt><dd>${esc(c.plan || '—')}</dd></div><div style="display:flex;gap:8px;margin-top:12px">${c.logged_in ? `<button class="btn danger" data-act="claude-logout">${icon('x')}Log out</button>` :`<button class="btn primary" data-act="claude-login" data-busy="Opening…">${icon('key')}Log in to Claude</button>`}</div></div>
  </div>` : ''}
  ${S.ui.setTab === 'notifications' ? `<div class="grid-3" style="margin-top:0;align-items:start">
    <div class="card section" style="grid-column:span 2">${head('bell', 'blue', 'In-app notifications', 'Shown in the bell menu and as toasts.')}
      ${[['notify_ready', 'Article ready for review', 'When Claude finishes an article'], ['notify_failed', 'Processing failed', 'When extraction or writing fails'], ['notify_published', 'Published to WordPress', 'After an article goes live'], ['notify_rules', 'Automation rule ran', 'Every rule execution']].map(([k, l, d2]) => row('app.' + k, s.app[k] !== false, l, d2)).join('')}</div>
    <div class="card info-card info-violet"><div class="ic">${icon('info')}</div><div><b>Email / Slack</b><p>External notifications are not configured. Everything is logged under Activity Logs.</p></div></div>
  </div>` : ''}
  ${S.ui.setTab === 'system' ? `<div class="grid-3" style="margin-top:0;align-items:start">
    <div class="card section">${head('cpu', 'blue', 'Runtime', 'Where the dashboard runs.')}<div class="kv-grid"><dt>Server</dt><dd>http://localhost:5050</dd><dt>Writers</dt><dd>${s.writers} parallel</dd><dt>Working now</dt><dd>${S.state.working_now || 0}</dd><dt>Articles</dt><dd>${S.counts.all || 0}</dd><dt>Sources</dt><dd>${S.state.sources_active} / ${S.state.sources_total}</dd></div></div>
    <div class="card section">${head('clock', 'violet', 'Background jobs', 'Running while this dashboard is open.')}<div class="sum-row">${icon('bolt')}Automation scheduler<div class="sv">every 30 s</div></div><div class="sum-row">${icon('refresh')}Live queue updates<div class="sv">every 4 s</div></div><div class="sum-row">${icon('bell')}Notification check<div class="sv">every 30 s</div></div></div>
    <div class="card section">${head('shield', 'green', 'Maintenance', 'Housekeeping tools.')}<div style="display:grid;gap:8px"><button class="btn" data-act="logs-cleanup" data-busy="Cleaning…">${icon('trash')}Clean old logs</button><button class="btn" data-act="cache-clear">${icon('refresh')}Clear cache</button><a class="btn" href="/api/export/backup">${icon('download')}Download backup</a></div></div>
  </div>` : ''}
  ${S.ui.setTab === 'general' ? `<div class="grid-3" style="margin-top:0;align-items:start">
    <div class="card section">${head('bank', 'blue', 'Site Information', 'Basic information about your platform.')}
      <div class="field"><label>Dashboard Name</label><input class="input" data-set="app.dashboard_name" value="${esc(s.app.dashboard_name)}"></div>
      <div class="field"><label>Website</label><input class="input" value="${esc(wp.url || S.state.wp_url || '')}" disabled><div class="hint">Change it under Integrations → WordPress.</div></div>
      <div class="field-row"><div class="field"><label>Article Language</label><input class="input" value="Marathi (मराठी)" disabled></div><div class="field"><label>Timezone</label><input class="input" value="${Intl.DateTimeFormat().resolvedOptions().timeZone}" disabled></div></div></div>
    <div class="card section">${head('gear', 'violet', 'Application Settings', 'Configure general application behavior.')}
      ${row('app.auto_extract', s.app.auto_extract, 'Auto-extract on select', 'Fetch source content right after selecting')}
      ${row('publish.auto_draft', s.publish.auto_draft, 'Auto-save WordPress draft', 'Send every finished article to WordPress as a draft')}
      ${row('app.duplicate_check', s.app.duplicate_check, 'Enable duplicate check', 'Skip titles that were already selected or written')}
      ${row('app.combine_sources', s.app.combine_sources !== false, 'Combine same news from several sources', 'When websites report the same story, write one article from all of them')}
      ${row('publish.rankmath_meta', s.publish.rankmath_meta, 'Auto-generate SEO data', 'Send Rank Math keyword, title and description')}
      ${row('publish.featured_image', s.publish.featured_image, 'Upload featured image', 'Attach the image to the WordPress post')}</div>
    <div class="card section">${head('send', 'green', 'Default Publishing Settings', 'Set default options for article publishing.')}
      <div class="field"><label>Default Post Status</label><select class="select" style="width:100%" data-set="publish.post_status">${[['publish', 'Publish immediately'], ['draft', 'Draft'], ['future', 'Scheduled']].map(([v, l]) => `<option value="${v}" ${s.publish.post_status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Default Category</label><input class="input mr" list="wp-cats" data-set="publish.default_category" value="${esc(s.publish.default_category || '')}"><datalist id="wp-cats">${(S.wpLists?.categories || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="field"><label>Default Tags (comma separated)</label><input class="input mr" data-set="publish.default_tags" value="${esc(s.publish.default_tags || '')}"></div>
      <div class="field"><label>Default Author</label><select class="select" style="width:100%" data-set="publish.author"><option value="">Connected user${wp.user?.name ? ` (${esc(wp.user.name)})` : ''}</option>${(S.wpLists?.authors || []).map(u => `<option value="${u.id}" ${s.publish.author == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Default Featured Image Source</label><select class="select" style="width:100%" data-set="publish.image_source"><option value="source" ${s.publish.image_source === 'source' ? 'selected' : ''}>Image from the source page</option><option value="none" ${s.publish.image_source === 'none' ? 'selected' : ''}>None (upload manually)</option></select></div></div>
    <div class="card section">${head('file', 'violet', 'Content Settings', 'Configure article processing preferences.')}
      <div class="field"><label>Default Article Length</label><select class="select" style="width:100%" data-set="content.length">${[['short', 'Short (500–800 words)'], ['medium', 'Medium (800–1200 words)'], ['long', 'Long (1500–2000 words)']].map(([v, l]) => `<option value="${v}" ${s.content.length === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${row('content.source_link', s.content.source_link, 'Include Source Link', 'Add original source link in article')}
      ${row('quick.highlights', s.quick.highlights, 'Include Key Highlights', 'Exam-oriented facts table')}
      ${row('quick.mcq', s.quick.mcq, 'Include MCQs', '3–5 practice questions')}
      ${row('quick.faq', s.quick.faq, 'Generate FAQ', 'Add FAQ section using AI')}
      <div class="field" style="margin-top:12px"><label>Disclaimer</label><textarea class="input mr" rows="2" data-set="content.disclaimer" placeholder="Leave empty for none">${esc(s.content.disclaimer || '')}</textarea></div></div>
    <div class="card section">${head('brain', 'orange', 'AI Model Settings', 'Claude runs through Claude Code on this laptop.')}
      <div class="field"><label>AI Provider</label><input class="input" value="Claude (Anthropic) via Claude Code · ${c.logged_in ? 'logged in' : 'not logged in'}" disabled></div>
      <div class="field"><label>Model</label><select class="select" style="width:100%" data-set="model">${[['', 'Claude Code default (recommended)'], ['opus', 'Claude Opus'], ['sonnet', 'Claude Sonnet'], ['haiku', 'Claude Haiku']].map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field-row"><div class="field"><label>Parallel writers</label><select class="select" style="width:100%" data-set="writers">${[1, 2, 3, 4].map(n => `<option value="${n}" ${s.writers == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label>Plan</label><input class="input" value="${esc(c.plan || '—')}" disabled></div></div>
      <div class="hint">Temperature and token limits are managed by Claude Code; the article length is controlled in Content Settings.</div></div>
    <div class="card section">${head('gear', 'pink', 'Advanced Options', 'Additional configuration options.')}
      ${row('seo.internal_links', s.seo.internal_links, 'Internal linking', 'Give Claude your recent posts for links')}
      <div class="field" style="margin-top:12px"><label>Keep activity logs for</label><select class="select" style="width:100%" data-set="app.log_keep_days">${[7, 30, 90, 365].map(n => `<option value="${n}" ${s.app.log_keep_days == n ? 'selected' : ''}>${n} days</option>`).join('')}</select></div>
      <button class="btn" data-act="logs-cleanup" data-busy="Cleaning…">${icon('trash')}Clean old logs now</button></div>
  </div>
  <div class="card section" style="margin-top:18px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;border-color:#fecdd3">
    <div class="tcell"><div class="kpi-icon g-red" style="width:44px;height:44px;border-radius:12px">${icon('warn')}</div><div><b style="font-size:15px">Danger Zone</b><div class="row-meta">Irreversible actions for advanced users.</div></div></div>
    <div class="card section" style="box-shadow:none;flex:1;min-width:220px"><b>Clear Cache</b><div class="row-meta" style="margin-bottom:8px">Remove cached titles and page previews.</div><button class="btn danger" data-act="cache-clear">${icon('trash')}Clear Cache</button></div>
    <div class="card section" style="box-shadow:none;flex:1;min-width:220px"><b>Reset All Settings</b><div class="row-meta" style="margin-bottom:8px">Restore all settings to default values.</div><button class="btn danger" data-act="settings-reset">${icon('refresh')}Reset Settings</button></div>
    <div class="row-meta" style="margin-left:auto">Changes save automatically.</div>
  </div>` : ''}
  ${S.ui.setTab === 'integrations' ? `<div class="grid-3" style="margin-top:0;align-items:start">
    <div class="card section">${head('wp', 'wp', 'WordPress', wp.connected ? `Connected to ${esc(wp.name || wp.url)}` : 'Not connected')}<div class="kv-grid" style="margin-bottom:12px"><dt>Site</dt><dd>${esc(wp.url || S.state.wp_url || '—')}</dd><dt>User</dt><dd>${esc(wp.user?.name || '—')}</dd><dt>Rank Math</dt><dd>${wp.rankmath ? 'Detected' : 'Not detected'}</dd><dt>Version</dt><dd>${esc(wp.version || '—')}</dd></div><div style="display:flex;gap:8px"><button class="btn primary" data-act="wp-connect-modal">${icon('key')}${wp.connected ? 'Update connection' : 'Connect'}</button><button class="btn" data-act="wp-test" data-busy="Testing…">Test</button></div></div>
    <div class="card section">${head('spark', 'orange', 'Claude Code', c.logged_in ? `Logged in · ${esc(c.plan || '')} plan` : 'Not logged in')}<p class="row-meta">Articles are written by Claude Code using your subscription. No API key is stored.</p><div style="display:flex;gap:8px">${c.logged_in ? '' : `<button class="btn primary" data-act="claude-login" data-busy="Opening…">${icon('key')}Log in to Claude</button>`}<button class="btn" data-act="claude-recheck" data-busy="Checking…">${icon('refresh')}Check status</button></div></div>
    <div class="card section">${head('bank', 'blue', 'News Sources', `${S.state.sources_active} active of ${S.state.sources_total}`)}<p class="row-meta">Add or remove websites under Sources.</p><a class="btn" href="#/sources">${icon('arrow')}Manage sources</a></div>
  </div>` : ''}
  ${S.ui.setTab === 'data' ? `<div class="grid-3" style="margin-top:0;align-items:start">
    <div class="card section">${head('download', 'blue', 'Export', 'Download your data.')}<div style="display:grid;gap:8px"><a class="btn" href="/api/export/articles?website=${encodeURIComponent(S.site || 'all')}">${icon('file')}Articles as CSV</a><a class="btn" href="/api/logs/export?website=${encodeURIComponent(S.site || 'all')}&days=365">${icon('list')}Activity logs as CSV</a><a class="btn primary" href="/api/export/backup">${icon('download')}Full backup (ZIP)</a></div><div class="hint" style="margin-top:8px">The backup contains all articles, images, settings, templates, sources and rules.</div></div>
    <div class="card section">${head('db', 'violet', 'Storage', 'Local files on this laptop.')}<div class="kv-grid"><dt>Articles</dt><dd>${S.counts.all || 0}</dd><dt>Disk used</dt><dd>${fmtBytes(S.state.storage_bytes || 0)}</dd><dt>Folder</dt><dd><code>ca_articles/</code></dd></div></div>
    <div class="card section">${head('shield', 'green', 'Privacy', 'Where your data lives.')}<div class="check-list">${['Everything is stored on this laptop', 'WordPress password stays in the local .env file', 'Source text is sent only to Claude for writing', 'No analytics or third-party tracking'].map(t => `<div class="ok">${icon('check')}<span>${t}</span></div>`).join('')}</div></div>
  </div>` : ''}`, first);
  bindSettingsInputs();
};
ACTIONS['set-tab'] = el => { S.ui.setTab = el.dataset.v; ROUTES.settings(false); };
ACTIONS['cache-clear'] = async () => { if (!await confirmBox({ title: 'Clear cache?', text: 'Cached titles and page previews are removed. Scan sources again afterwards.', ok: 'Clear', kind: 'danger-solid' })) return; await api('/api/cache/clear', { method: 'POST' }); S.titles = { items: [], errors: {}, stats: {} }; updateNav(); toast('ok', 'Cache cleared'); };
ACTIONS['settings-reset'] = async () => { if (!await confirmBox({ title: 'Reset all settings?', text: 'Publishing, SEO, content and AI settings go back to defaults. Templates, sources and rules are kept.', ok: 'Reset', kind: 'danger-solid' })) return; S.settings = await api('/api/settings/reset', { method: 'POST' }); toast('ok', 'Settings reset'); ROUTES.settings(false); };
ACTIONS['logs-cleanup'] = async el => { await busy(el, async () => { const r = await api('/api/logs/cleanup', { method: 'POST' }); toast('ok', `${r.removed} old log entries removed`); }); };
