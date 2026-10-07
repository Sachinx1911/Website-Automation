/* Pages: Review Center, Article, Published Articles, WordPress, Claude Configuration */

// ------------------------------------------------------------------ REVIEW CENTER
ROUTES.review = async function (first) {
  if (first) { await Promise.all([loadArticles(), loadState(), loadWp()]); S.ui.rvTab = 'edit'; S.ui.rvQ = ''; S.ui.rvStatus = ''; S.ui.device = 'desktop'; S.ui.editing = false; }
  const list = S.articles.filter(a => inReview(a) || a.status === 'published').filter(a => (!S.ui.rvQ || a.title.toLowerCase().includes(S.ui.rvQ)) && (!S.ui.rvStatus || a.status === S.ui.rvStatus));
  const c = S.counts;
  if (!S.current || !list.some(a => a.id === S.current.id)) {
    const pick = S.param ? list.find(a => a.id === S.param) : list[0];
    S.current = pick ? await api(`/api/articles/${pick.id}`) : null;
  }
  const cur = S.current;
  paint(`
  ${pageHead({ crumb: 'Review Center', icon: 'check', color: 'g-blue', title: 'Review Center', sub: 'Review, edit and optimize AI-generated articles before publishing to your WordPress website.',
    right: `<div class="head-info">${icon('calendar')}<div><b>Today</b><span>${fmtDate(today())}</span></div></div>` })}
  <div class="kpis stagger">
    ${kpi({ g: 'violet', ic: 'file', val: (c.ready || 0) + (c.changes || 0), label: 'Articles to Review', note: 'Generated with AI' })}
    ${kpi({ g: 'green', ic: 'check', val: c.approved || 0, label: 'Approved', note: 'Ready to publish' })}
    ${kpi({ g: 'orange', ic: 'edit', val: c.changes || 0, label: 'Need Modifications', note: 'Edit and improve' })}
    ${kpi({ g: 'red', ic: 'x', val: c.rejected || 0, label: 'Rejected', note: 'Not suitable' })}
    ${kpi({ href: '#/wordpress', g: 'wp', ic: 'wp', val: S.state.wp_ready ? 'Connected' : 'Offline', label: 'WordPress', note: S.state.wp_ready ? 'Ready to publish' : 'Connect to publish', small: true })}
  </div>
  <div class="review-layout">
    <div class="card" style="overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line2);display:flex;gap:8px;flex-wrap:wrap">
        <div class="search-in grow">${icon('search')}<input class="input" id="rv-q" placeholder="Search articles…" value="${esc(S.ui.rvQ)}"></div>
        <select class="select" id="rv-status"><option value="">All Status</option>${['ready', 'changes', 'approved', 'rejected', 'draft', 'scheduled', 'published'].map(s => `<option value="${s}" ${S.ui.rvStatus === s ? 'selected' : ''}>${STATUS[s][1]}</option>`).join('')}</select>
      </div>
      <div class="rv-list">${list.length ? list.map(a => `<div class="rv-item ${cur?.id === a.id ? 'on' : ''}" data-act="rv-open" data-id="${a.id}">
        <div class="cb ${S.asel.has(a.id) ? 'on' : ''}" data-act="pick-art" data-id="${a.id}">${icon('tick')}</div>${thumb(a, 'thumb')}
        <div class="row-main"><div class="rt ${mr(a.title)}">${esc(a.title)}</div><div class="rm">${esc(a.source.source)} · ${fmtDate(a.created)}</div><div class="rb">${catPill(a.categories[0] || a.source.category)}${badge(a.status)}${srcCount(a)}</div></div></div>`).join('')
      : empty('check', 'Nothing to review', 'Finished articles appear here.')}</div>
    </div>
    ${cur ? reviewEditor(cur) : `<div class="card">${empty('file', 'Select an article', 'Pick an article from the list to review it.')}</div><div></div>`}
  </div>
  ${cur ? `<div class="action-bar">
    <button class="btn" data-act="rv-nav" data-d="-1">${icon('back')}Previous Article</button><div class="grow"></div>
    <button class="btn" data-act="one" data-a="retry" data-id="${cur.id}" style="color:var(--violet);border-color:#ddd6fe;background:var(--violet-soft)">${icon('spark')}Regenerate with Claude</button>
    <button class="btn" data-act="rv-save" data-busy="Saving…" style="color:var(--primary);border-color:#bfdbfe;background:var(--primary-soft)">${icon('save')}Save Changes</button>
    <button class="btn success" data-act="one" data-a="approve" data-id="${cur.id}">${icon('tick')}Approve</button>
    <button class="btn danger-solid" data-act="one" data-a="reject" data-id="${cur.id}">${icon('x')}Reject</button>
    <button class="btn primary" data-act="one" data-a="publish" data-id="${cur.id}" data-busy="Publishing…">${icon('wp')}Publish to WordPress</button>
    <button class="btn" data-act="rv-nav" data-d="1">Next Article ${icon('arrow')}</button>
  </div>` : ''}`, first);
  bindReview();
};

function reviewEditor(a) {
  const art = a.article, tab = S.ui.rvTab, seo = a.seo_detail || { score: 0, checks: [] };
  const cats = (S.wp?.connected && S.wpLists?.categories) || null;
  const editTab = `<div class="editor-body">
    <div class="field"><label>Title <em>*</em></label><input class="input mr" id="e-title" value="${esc(art.title)}"></div>
    <div class="field-row"><div class="field"><label>Slug <em>*</em></label><input class="input" id="e-slug" value="${esc(art.slug)}"></div><div class="field"><label>Focus keyword</label><input class="input mr" id="e-kw" value="${esc(art.focus_keyword)}"></div></div>
    <div class="field"><label>Category <em>*</em></label><div class="chipbox" id="e-cats">${art.categories.map(c => `<span class="tag cat2 x mr" data-rm="${esc(c)}">${esc(c)}<span class="rm">×</span></span>`).join('')}<input id="e-cat-in" list="cat-list" placeholder="Add category…"><datalist id="cat-list">${(cats || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
    <div class="field"><label>Tags</label><div class="chipbox" id="e-tags">${art.tags.map(t => `<span class="tag x mr" data-rm="${esc(t)}">${esc(t)}<span class="rm">×</span></span>`).join('')}<input id="e-tag-in" placeholder="Add tag and press Enter…"></div></div>
    <div class="field"><label>Meta description</label><textarea class="input mr" id="e-excerpt" rows="2">${esc(art.excerpt)}</textarea><div class="counter" id="e-excerpt-n">${[...art.excerpt].length} / 160</div></div>
    <div class="field"><label>Content</label>
      <div class="rte-bar"><select id="rte-block"><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
        <button type="button" data-cmd="bold" title="Bold">${icon('bold')}</button><button type="button" data-cmd="italic" title="Italic">${icon('italic')}</button><button type="button" data-cmd="underline" title="Underline">${icon('underline')}</button><span class="sep"></span>
        <button type="button" data-cmd="insertUnorderedList" title="Bullet list">${icon('ul')}</button><button type="button" data-cmd="insertOrderedList" title="Numbered list">${icon('ol')}</button><button type="button" data-cmd="formatBlock" data-val="blockquote" title="Quote">${icon('quote')}</button><span class="sep"></span>
        <button type="button" data-cmd="link" title="Link">${icon('link')}</button><button type="button" data-cmd="image" title="Image">${icon('image')}</button><button type="button" data-cmd="html" title="HTML source">${icon('code')}</button></div>
      <div class="rte mr" id="rte" contenteditable="true">${art.content_html}</div></div>
  </div>`;
  const tabs = { edit: editTab,
    source: sourceTab(a),
    ai: `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">AI Data</div><dl class="kv-grid"><dt>Status</dt><dd>${badge(a.status)}</dd><dt>Words</dt><dd>${a.words}</dd><dt>Reading time</dt><dd>${a.reading_min} min</dd><dt>Processing time</dt><dd>${fmtSecs(a.seconds)}</dd><dt>Started</dt><dd>${fmtDT(a.started)}</dd><dt>Finished</dt><dd>${fmtDT(a.finished)}</dd><dt>Template</dt><dd>${esc((S.templates.find(t => t.id === a.template_id) || S.templates.find(t => t.default) || {}).name || 'Default')}</dd></dl>
      <div class="section-title" style="margin:18px 0 10px">Processing log</div><div class="timeline">${(a.log || []).map(l => `<div class="tl ${l.level}"><div class="td"></div><time>${fmtTime(l.t)}</time><span>${esc(l.msg)}</span></div>`).join('')}</div></div>`,
    images: `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">Featured image</div>
      <label class="drop" id="drop" style="padding:22px">${a.has_image ? `<img src="/image/${a.id}?v=${encodeURIComponent(a.updated)}" alt="" style="max-height:260px;object-fit:cover">` : ''}${icon('image')}<div><b>Click or drop an image</b> to ${a.has_image ? 'replace' : 'add'} it</div><input type="file" accept="image/*" id="img-input" hidden></label>
      ${a.source_image ? `<div class="row-meta" style="margin-top:10px">Source image: <a class="link" target="_blank" href="${esc(a.source_image)}">${esc(a.source_image.slice(0, 80))}</a> — check the copyright before using images from coaching sites.</div>` : ''}</div>`,
    seo: `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">SEO &amp; Meta</div>
      <div class="field"><label>SEO title (Rank Math)</label><div class="prompt-box mr" style="min-height:0">${esc(art.title)}</div>${meter([...art.title].length, 40, 70, 90)}</div>
      <div class="field"><label>Meta description</label><div class="prompt-box mr" style="min-height:0">${esc(art.excerpt)}</div>${meter([...art.excerpt].length, 120, 160, 200)}</div>
      <dl class="kv-grid"><dt>Focus keyword</dt><dd class="mr">${esc(art.focus_keyword)}</dd><dt>URL</dt><dd><code>${esc((S.state.wp_url || '') + '/' + art.slug)}</code></dd><dt>Categories</dt><dd>${art.categories.map(c => `<span class="tag cat2 mr">${esc(c)}</span>`).join('')}</dd><dt>Tags</dt><dd>${art.tags.map(t => `<span class="tag mr">${esc(t)}</span>`).join('')}</dd></dl>
      <div class="section-title" style="margin:18px 0 8px">Checklist</div><div class="check-list">${seo.checks.map(ch => `<div class="${ch.ok ? 'ok' : 'no'}">${icon(ch.ok ? 'check' : 'alert')}<span>${esc(ch.label)} <span class="row-meta">(${ch.weight} pts)</span></span></div>`).join('')}</div></div>`,
    notes: `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">Reviewer notes</div><textarea class="input" id="e-notes" rows="10" placeholder="Notes for yourself or for the next rewrite…">${esc(a.notes || '')}</textarea><div style="display:flex;gap:10px;margin-top:12px"><button class="btn primary" data-act="rv-save" data-busy="Saving…">${icon('save')}Save notes</button><button class="btn" data-act="one" data-a="changes" data-id="${a.id}">${icon('edit')}Mark as needs modification</button></div></div>`,
  };
  return `<div class="card" style="overflow:hidden">
    <div class="editor-tabs">${[['edit', 'Edit Article'], ['source', 'Source Content'], ['ai', 'AI Data'], ['images', 'Images'], ['seo', 'SEO & Meta'], ['notes', 'Notes']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="rv-tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${tabs[tab] || editTab}
    <div class="editor-foot"><span>Word Count: <b id="wc">${a.words}</b></span><span>Reading Time: <b>${a.reading_min} min</b></span><span>Last Updated: <b>${fmtDT(a.updated)}</b></span><div class="grow"></div>${badge(a.status)}<button class="btn sm" data-act="one" data-a="draft" data-id="${a.id}" data-busy="Sending…">${icon('send')}${a.wp_id ? 'Update WordPress draft' : 'Save Draft to WordPress'}</button></div>
  </div>
  <div class="stack">
    <div class="card section"><div class="section-head"><div class="device-tabs"><button class="${S.ui.device === 'desktop' ? 'on' : ''}" data-act="rv-device" data-v="desktop">${icon('desktop')}Desktop</button><button class="${S.ui.device === 'mobile' ? 'on' : ''}" data-act="rv-device" data-v="mobile">${icon('mobile')}Mobile</button></div>${a.url ? `<a class="link" target="_blank" href="${esc(a.url)}">Live Preview ↗</a>` : ''}</div>
      <div class="live-prev ${S.ui.device}" id="live-prev">${livePreview(a)}</div></div>
    <div class="card section"><div class="section-head"><div class="section-title">SEO Analysis</div><button class="link" data-act="rv-tab" data-v="seo">View Details →</button></div>
      <div class="score-wrap">${ring(seo.score)}<div class="check-list" style="flex:1">${seo.checks.slice(0, 7).map(ch => `<div class="${ch.ok ? 'ok' : 'no'}">${icon(ch.ok ? 'check' : 'alert')}<span>${esc(ch.label.split(' (')[0])}</span></div>`).join('')}</div></div></div>
  </div>`;
}
// every website the article was written from: the main source first, then the same story on other sources
function sourceTab(a) {
  const read = a.related_texts || [], unread = (a.related || []).filter(r => !read.some(t => t.url === r.url));
  const block = (name, title, url, date, text, i) => `<div class="src-block"><div class="section-head" style="margin-bottom:8px"><div class="tcell">${srcLogo(name, 'sm')}<div><b>${read.length ? `Source ${i}: ` : ''}${esc(name)}</b><div class="row-meta ${mr(title)}">${esc(title)}${date ? ` · ${fmtDate(date)}` : ''}</div></div></div><a class="link" target="_blank" href="${esc(url)}">Open original ↗</a></div>
    <div class="src-text ${mr(text)}">${esc(text || 'Source content was not stored for this article.')}</div></div>`;
  return `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">Source Content${read.length ? ` <span class="row-meta" style="font-weight:500">— written from ${read.length + 1} sources reporting the same news</span>` : ''}</div>
    ${block(a.source.source, a.source.title, a.source.url, a.source.date, a.source_text, 1)}
    ${read.map((r, i) => block(r.source, r.title, r.url, '', r.text, i + 2)).join('')}
    ${unread.length ? `<div class="row-meta" style="margin-top:10px">Could not be read (not used): ${unread.map(r => `<a class="link" target="_blank" href="${esc(r.url)}">${esc(r.source)}</a>`).join(', ')}</div>` : ''}</div>`;
}
function livePreview(a) {
  const art = a.article;
  return `<div class="lp-body">${catPill(art.categories[0] || 'Current Affairs')}<h2 class="mr">${esc(art.title)}</h2>
    <div class="lp-meta"><span>${esc(a.source.source)}</span><span>${fmtDate(a.created)}</span><span>${a.reading_min} min read</span></div>
    ${a.has_image ? `<img class="lp-img" src="/image/${a.id}?v=${encodeURIComponent(a.updated)}" alt="">` : ''}<div class="lp-content mr">${art.content_html}</div></div>`;
}
const meter = (len, lo, hi, max) => { const ok = len >= lo && len <= hi; const color = ok ? 'var(--success)' : len < lo ? 'var(--warning)' : 'var(--danger)'; return `<div class="meter"><i style="width:${Math.min(100, len / max * 100)}%;background:${color}"></i></div><div class="meter-l"><span>${len} characters</span><span>${ok ? 'Good' : len < lo ? 'A bit short' : 'Too long'} · ideal ${lo}–${hi}</span></div>`; };

function bindReview() {
  const q = $('#rv-q'); if (q) q.oninput = e => { S.ui.rvQ = e.target.value.toLowerCase(); clearTimeout(S._rq); S._rq = setTimeout(() => { ROUTES.review(false); const x = $('#rv-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
  const st = $('#rv-status'); if (st) st.onchange = e => { S.ui.rvStatus = e.target.value; ROUTES.review(false); };
  const rte = $('#rte');
  if (rte) {
    S.ui.editing = false;
    const sync = () => { S.ui.editing = true; const words = rte.innerText.split(/\s+/).filter(Boolean).length; $('#wc').textContent = words; const lp = $('#live-prev .lp-content'); if (lp) lp.innerHTML = rte.innerHTML; };
    rte.addEventListener('input', sync);
    $('#e-title').addEventListener('input', e => { S.ui.editing = true; const h = $('#live-prev h2'); if (h) h.textContent = e.target.value; });
    $('#e-excerpt').addEventListener('input', e => { S.ui.editing = true; $('#e-excerpt-n').textContent = `${[...e.target.value].length} / 160`; });
    $$('.rte-bar button').forEach(b => b.onclick = () => {
      const cmd = b.dataset.cmd; rte.focus();
      if (cmd === 'link') { const u = prompt('Link URL'); if (u) document.execCommand('createLink', false, u); }
      else if (cmd === 'image') { const u = prompt('Image URL'); if (u) document.execCommand('insertImage', false, u); }
      else if (cmd === 'html') { const html = prompt('Edit HTML of the whole article', rte.innerHTML); if (html !== null) rte.innerHTML = html; }
      else document.execCommand(cmd, false, b.dataset.val || null);
      sync();
    });
    $('#rte-block').onchange = e => { rte.focus(); document.execCommand('formatBlock', false, e.target.value); sync(); };
    const chips = (boxId, inId) => {
      const box = $(boxId), inp = $(inId);
      box.addEventListener('click', e => { const t = e.target.closest('[data-rm]'); if (t) { t.remove(); S.ui.editing = true; } inp.focus(); });
      inp.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); const v = inp.value.trim().replace(/,$/, ''); const span = document.createElement('span'); span.className = `tag ${boxId === '#e-cats' ? 'cat2' : ''} x ${mr(v)}`; span.dataset.rm = v; span.innerHTML = `${esc(v)}<span class="rm">×</span>`; box.insertBefore(span, inp); inp.value = ''; S.ui.editing = true; } });
      inp.addEventListener('change', () => { if (boxId === '#e-cats' && inp.value.trim()) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    };
    chips('#e-cats', '#e-cat-in'); chips('#e-tags', '#e-tag-in');
    if (!S.wpLists && S.state.wp_ready) api('/api/wordpress/lists').then(d => { S.wpLists = d; const dl = $('#cat-list'); if (dl) dl.innerHTML = d.categories.map(c => `<option value="${esc(c)}">`).join(''); }).catch(() => {});
  }
  bindDrop(S.current?.id);
}
function bindDrop(id) {
  const drop = $('#drop'), input = $('#img-input');
  if (!drop || !id) return;
  const send = async file => {
    if (!file) return;
    const fd = new FormData(); fd.append('image', file);
    drop.innerHTML = '<span class="spin"></span> Uploading…';
    try { await api(`/api/articles/${id}/image`, { method: 'POST', body: fd }); toast('ok', 'Image updated'); S.current = await api(`/api/articles/${id}`); await loadArticles(); rerender(); }
    catch (e) { toast('err', 'Upload failed', e.message); rerender(); }
  };
  input.onchange = () => send(input.files[0]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => send(e.dataTransfer.files[0]));
}
async function saveReview(btn) {
  const a = S.current; if (!a) return;
  const body = {};
  if ($('#rte')) {
    body.title = $('#e-title').value; body.slug = $('#e-slug').value; body.focus_keyword = $('#e-kw').value; body.excerpt = $('#e-excerpt').value;
    body.content_html = $('#rte').innerHTML; body.categories = $$('#e-cats [data-rm]').map(x => x.dataset.rm); body.tags = $$('#e-tags [data-rm]').map(x => x.dataset.rm);
  }
  if ($('#e-notes')) body.notes = $('#e-notes').value;
  if (!Object.keys(body).length) return;
  await busy(btn, async () => { S.current = await api(`/api/articles/${a.id}/edit`, { method: 'POST', body }); });
  S.ui.editing = false;
  toast('ok', 'Changes saved', a.wp_id ? 'Click “Update WordPress draft” or Publish to send them to the site' : '');
  await loadArticles(); rerender();
}
ACTIONS['rv-open'] = async (el, e) => { if (e.target.closest('.cb')) return; S.current = await api(`/api/articles/${el.dataset.id}`); S.ui.editing = false; ROUTES.review(false); };
ACTIONS['rv-tab'] = async el => { if (S.ui.editing && S.ui.rvTab === 'edit' && !await confirmBox({ title: 'Discard unsaved edits?', text: 'You have unsaved changes in the editor.', ok: 'Discard' })) return; S.ui.editing = false; S.ui.rvTab = el.dataset.v; ROUTES.review(false); };
ACTIONS['rv-device'] = el => { S.ui.device = el.dataset.v; $('#live-prev').className = `live-prev ${el.dataset.v}`; $$('.device-tabs button').forEach(b => b.classList.toggle('on', b === el)); };
ACTIONS['rv-save'] = el => saveReview(el);
ACTIONS['rv-nav'] = async el => {
  const list = S.articles.filter(a => inReview(a) || a.status === 'published');
  const i = list.findIndex(a => a.id === S.current?.id), n = list[i + (+el.dataset.d)];
  if (!n) return toast('info', 'No more articles');
  S.current = await api(`/api/articles/${n.id}`); S.ui.editing = false; ROUTES.review(false);
};

// ------------------------------------------------------------------ ARTICLE (single)
ROUTES.article = async function (first) {
  const a = await api(`/api/articles/${S.param}`);
  S.current = a;
  const back = `<a class="back" href="#/review">${icon('back')}Back</a>`;
  if (isWorking(a)) {
    const order = ['queued', 'fetching', 'writing', 'uploading'], now = a.status === 'queued' ? 'queued' : (a.step || 'writing'), idx = order.indexOf(now);
    return paint(`${back}<div class="card writing fade-up"><div class="orb"></div><h2 class="${mr(a.title)}" style="margin:0 0 6px">${esc(a.title)}</h2>
      <div class="subtitle">${a.status === 'queued' ? 'Waiting for a free writer…' : 'This usually takes 2–5 minutes. You can leave this page — it keeps working.'}</div>
      <div class="steps">${[['fetching', 'Reading source'], ['writing', 'Claude is writing'], ['uploading', 'Sending to WordPress']].map(([k, l]) => { const i = order.indexOf(k); return `<span class="step ${i < idx ? 'done' : i === idx ? 'now' : ''}"><span class="bd"></span>${l}</span>`; }).join('')}</div>
      <div class="timeline" style="max-width:520px;margin:28px auto 0;text-align:left">${(a.log || []).slice(-6).map(l => `<div class="tl ${l.level}"><div class="td"></div><time>${fmtTime(l.t)}</time><span>${esc(l.msg)}</span></div>`).join('')}</div></div>`, first);
  }
  if (!a.article) {
    return paint(`${back}${a.error ? `<div class="alert err">${icon('alert')}<div><b>Processing failed</b><br>${esc(a.error)}</div></div>` : ''}
      <div class="grid-side"><div class="card section"><div class="row-title ${mr(a.title)}" style="white-space:normal;font-size:17px">${esc(a.title)}</div><div class="row-meta" style="margin:6px 0 16px">${badge(a.status)} · ${esc(a.source.source)} · <a class="link" target="_blank" href="${esc(a.source.url)}">Open source</a></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="one" data-a="extract" data-id="${a.id}" data-busy="Extracting…">${icon('download')}Extract content</button><button class="btn violet" data-act="one" data-a="process" data-id="${a.id}">${icon('brain')}Process with Claude</button><button class="btn danger" data-act="one" data-a="delete" data-id="${a.id}">${icon('trash')}Remove</button></div>
      ${a.source_text ? `<div class="section-title" style="margin:20px 0 8px">Extracted source content</div><div class="src-text ${mr(a.source_text)}">${esc(a.source_text.slice(0, 4000))}</div>` : ''}</div>
      <div class="card section"><div class="section-title" style="margin-bottom:10px">Log</div><div class="timeline">${(a.log || []).map(l => `<div class="tl ${l.level}"><div class="td"></div><time>${fmtTime(l.t)}</time><span>${esc(l.msg)}</span></div>`).join('')}</div></div></div>`, first);
  }
  location.hash = `#/review/${a.id}`;
};

// ------------------------------------------------------------------ PUBLISHED
ROUTES.published = async function (first) {
  if (first) { await Promise.all([loadArticles(), loadState(), loadWp()]); S.ui.pubQ = ''; S.ui.pubCat = ''; S.ui.pubStatus = ''; S.ui.pubDays = '30'; S.ui.pubPage = 1; }
  const all = S.articles.filter(a => ['published', 'scheduled', 'draft'].includes(a.status));
  const since = S.ui.pubDays === 'all' ? '' : new Date(Date.now() - (+S.ui.pubDays) * 864e5).toISOString();
  let list = all.filter(a => (!S.ui.pubQ || a.title.toLowerCase().includes(S.ui.pubQ)) && (!S.ui.pubCat || a.categories.includes(S.ui.pubCat)) && (!S.ui.pubStatus || a.status === S.ui.pubStatus) && (!since || (a.published_at || a.updated) >= since));
  list = sortList('pub', list, { title: a => a.title, category: a => a.categories[0] || '', date: a => a.published_at || a.updated, seo: a => a.seo, status: a => a.status });
  const per = perPage('pub'), page = S.ui.pubPage, slice = list.slice((page - 1) * per, page * per);
  const cats = [...new Set(all.flatMap(a => a.categories))];
  const pub = all.filter(a => a.status === 'published');
  const avgSeo = pub.length ? Math.round(pub.reduce((s, a) => s + a.seo, 0) / pub.length) : 0;
  paint(`
  ${pageHead({ title: 'Published Articles', sub: 'Manage and view all your published articles on WordPress.',
    right: `<a class="btn primary lg" target="_blank" href="${esc(S.state.wp_url || '#')}/wp-admin/post-new.php">${icon('plus')}Manual Publish</a>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'green', ic: 'file', val: pub.length, label: 'Total Published', note: `${pub.filter(a => (a.published_at || '').slice(0, 7) === today().slice(0, 7)).length} this month` })}
    ${kpi({ g: 'blue', ic: 'calendar', val: S.state.published_today, label: 'Published Today', ...trendNote(S.state.published_today, S.state.published_yesterday) })}
    ${kpi({ g: 'violet', ic: 'clock', val: all.filter(a => a.status === 'scheduled').length, label: 'Scheduled', note: `${all.filter(a => a.status === 'draft').length} drafts on WordPress` })}
    ${kpi({ g: 'orange', ic: 'award', val: avgSeo, label: 'Avg. SEO Score', note: pub.length ? `${pub.filter(a => a.seo >= 80).length} articles scored 80+` : 'No published articles yet' })}
  </div>
  <div class="card toolbar">
    <div class="search-in grow">${icon('search')}<input class="input" id="pub-q" placeholder="Search published articles…" value="${esc(S.ui.pubQ)}"></div>
    <select class="select" id="pub-cat"><option value="">All Categories</option>${cats.map(c => `<option ${S.ui.pubCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="select" id="pub-status"><option value="">All Status</option><option value="published" ${S.ui.pubStatus === 'published' ? 'selected' : ''}>Live</option><option value="scheduled" ${S.ui.pubStatus === 'scheduled' ? 'selected' : ''}>Scheduled</option><option value="draft" ${S.ui.pubStatus === 'draft' ? 'selected' : ''}>Draft</option></select>
    <select class="select" id="pub-days">${[['7', 'Last 7 Days'], ['30', 'Last 30 Days'], ['90', 'Last 90 Days'], ['all', 'All time']].map(([v, l]) => `<option value="${v}" ${S.ui.pubDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <a class="btn" href="/api/export/articles">${icon('download')}Export</a><button class="icon-btn" data-act="pub-refresh" style="width:38px;height:38px">${icon('refresh')}</button>
  </div>
  <div class="card section">
    ${slice.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>#</th><th>Featured image</th>${th('pub', 'title', 'Title')}${th('pub', 'category', 'Category')}${th('pub', 'date', 'Published date')}${th('pub', 'seo', 'SEO')}${th('pub', 'status', 'Status')}<th>Actions</th></tr></thead><tbody>
    ${slice.map((a, i) => `<tr class="clickable ${S.asel.has(a.id) ? 'on' : ''}" data-href="#/review/${a.id}"><td style="width:36px"><div class="cb ${S.asel.has(a.id) ? 'on' : ''}" data-act="pick-art" data-id="${a.id}">${icon('tick')}</div></td><td class="row-meta">${(page - 1) * per + i + 1}</td>
      <td>${thumb(a, 'thumb lg')}</td><td><div class="t-title wrap ${mr(a.title)}" style="max-width:360px">${esc(a.title)}</div><div>${a.tags.slice(0, 3).map(t => `<span class="tag mr">${esc(t)}</span>`).join('')}</div></td>
      <td>${catPill(a.categories[0])}</td><td class="row-meta">${fmtDate(a.published_at || a.scheduled_for || a.updated)}<br>${fmtTime(a.published_at || a.scheduled_for || a.updated)}</td><td>${ring(a.seo, true)}</td><td>${badge(a.status)}</td>
      <td><div class="acts"><a class="icon-btn" href="#/review/${a.id}" title="View">${icon('eye')}</a><a class="icon-btn" target="_blank" href="${esc(S.state.wp_url)}/wp-admin/post.php?post=${a.wp_id}&action=edit" title="Edit in WordPress">${icon('edit')}</a><a class="icon-btn" target="_blank" href="${esc(a.url)}" title="Open">${icon('ext')}</a>${a.status !== 'published' ? `<button class="icon-btn green" data-act="one" data-a="publish" data-id="${a.id}" title="Publish now">${icon('rocket')}</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div>${pager(list.length, page, per, 'pub-page')}` : empty('rocket', 'Nothing published yet', 'Publish from the Review Center or WordPress page.', `<a class="btn primary" href="#/review">${icon('check')}Open Review Center</a>`)}
  </div>`, first);
  renderBulk();
  const bind = (id, key, debounce) => { const el = $(id); if (!el) return; el[debounce ? 'oninput' : 'onchange'] = e => { S.ui[key] = debounce ? e.target.value.toLowerCase() : e.target.value; S.ui.pubPage = 1; clearTimeout(S._pq); S._pq = setTimeout(() => { ROUTES.published(false); if (debounce) { const x = $(id); x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, debounce ? 250 : 0); }; };
  bind('#pub-q', 'pubQ', true); bind('#pub-cat', 'pubCat'); bind('#pub-status', 'pubStatus'); bind('#pub-days', 'pubDays');
};
ACTIONS['pub-page'] = el => { S.ui.pubPage = +el.dataset.p; ROUTES.published(false); };
ACTIONS['pub-refresh'] = async () => { await Promise.all([loadArticles(), loadWp()]); ROUTES.published(false); };

// ------------------------------------------------------------------ WORDPRESS
ROUTES.wordpress = async function (first) {
  if (first) { await Promise.all([loadArticles(), loadState(), loadWp(), loadSettings(), S.state.wp_ready ? api('/api/wordpress/lists').then(d => { S.wpLists = d; }).catch(() => {}) : null]); S.ui.wpTab = 'ready'; }
  const wp = S.wp || {}, pub = S.settings.publish;
  const groups = { ready: S.articles.filter(a => ['approved', 'ready', 'changes'].includes(a.status)), published: S.articles.filter(a => a.status === 'published'), scheduled: S.articles.filter(a => a.status === 'scheduled'), drafts: S.articles.filter(a => a.status === 'draft'), failed: S.articles.filter(a => a.status === 'error' && a.article) };
  const rows = groups[S.ui.wpTab] || [];
  for (const id of [...S.asel]) if (!S.articles.some(a => a.id === id && a.article)) S.asel.delete(id);
  const approved = S.articles.filter(a => a.status === 'approved');
  paint(`
  ${pageHead({ crumb: 'WordPress Publishing', icon: 'wp', color: 'g-wp', title: 'WordPress Publishing', sub: 'Manage your WordPress connection and publish AI-generated articles.',
    right: `<a class="btn" href="#/published">View Published Articles ${icon('ext')}</a>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'blue', ic: 'file', val: approved.length, label: 'Ready to Publish', note: 'Approved articles' })}
    ${kpi({ g: 'green', ic: 'check', val: wp.today ?? S.state.published_today, label: 'Published Today', ...trendNote(S.state.published_today, S.state.published_yesterday) })}
    ${kpi({ g: 'violet', ic: 'clock', val: groups.scheduled.length, label: 'Scheduled', note: 'Auto publish' })}
    ${kpi({ g: 'pink', ic: 'edit', val: wp.drafts ?? groups.drafts.length, label: 'Drafts', note: 'Saved for later' })}
  </div>
  <div class="grid-side">
    <div class="card section">
      <div class="tabs underline">${[['ready', 'Ready to Publish'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['drafts', 'Drafts'], ['failed', 'Failed']].map(([k, l]) => `<button class="tab ${S.ui.wpTab === k ? 'on' : ''}" data-act="wp-tab" data-v="${k}">${l} (${groups[k].length})</button>`).join('')}</div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>#</th><th>Title</th><th>Category</th><th>Source</th><th>SEO</th><th>Status</th><th>Modified</th><th>Actions</th></tr></thead><tbody>
        ${rows.map((a, i) => `<tr class="clickable ${S.asel.has(a.id) ? 'on' : ''}" data-href="#/review/${a.id}"><td style="width:36px"><div class="cb ${S.asel.has(a.id) ? 'on' : ''}" data-act="pick-art" data-id="${a.id}">${icon('tick')}</div></td><td class="row-meta">${i + 1}</td>
          <td><div class="tcell">${thumb(a, 'thumb')}<div class="t-title wrap ${mr(a.title)}">${esc(a.title)}</div></div></td><td>${catPill(a.categories[0])}</td><td><div class="tcell">${srcLogo(a.source.source, 'sm')}<span style="font-size:12px">${esc(a.source.source)}</span></div></td><td>${ring(a.seo, true)}</td><td>${badge(a.status)}</td><td class="row-meta">${ago(a.updated)}</td>
          <td><div class="acts"><a class="icon-btn" href="#/review/${a.id}">${icon('eye')}</a>${a.wp_id ? `<a class="icon-btn" target="_blank" href="${esc(S.state.wp_url)}/wp-admin/post.php?post=${a.wp_id}&action=edit">${icon('edit')}</a>` : ''}${a.status !== 'published' ? `<button class="icon-btn green" data-act="one" data-a="publish" data-id="${a.id}" title="Publish">${icon('rocket')}</button><button class="icon-btn blue" data-act="wp-schedule" data-id="${a.id}" title="Schedule">${icon('calendar')}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>` : empty('wp', 'No articles here', S.ui.wpTab === 'ready' ? 'Approve articles in the Review Center first.' : 'Nothing in this state yet.')}
      <div class="grid-3">
        <div class="card info-card info-blue" style="grid-column:span 2"><div class="ic">${icon('gear')}</div><div><b>SEO &amp; WordPress Optimization</b><p>Each publish sends the title, content, excerpt, slug, categories, tags${pub.featured_image ? ', featured image' : ''}${pub.rankmath_meta ? ' and Rank Math focus keyword / meta' : ''}.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${[['SEO Optimized', true], ['Meta Data Added', pub.rankmath_meta], ['Featured Image', pub.featured_image], ['Rank Math ' + (wp.rankmath ? 'detected' : 'not detected'), !!wp.rankmath]].map(([l, ok]) => `<span class="badge ${ok ? 'b-live' : 'b-off'}">${icon(ok ? 'check' : 'alert')}${l}</span>`).join('')}</div></div></div>
        <div class="card info-card info-pink"><div class="ic">${icon('bulb')}</div><div><b>Pro Tip</b><p>Review each article before publishing to ensure content accuracy and quality.</p><a class="link" href="#/review">Open Review Center →</a></div></div>
      </div>
    </div>
    <div class="stack sticky">
      <div class="card section"><div class="section-head"><div class="section-title">WordPress Connection</div>${wp.connected ? '<span class="badge b-live">Connected</span>' : '<span class="badge b-failed">Not connected</span>'}</div>
        <div class="tcell" style="margin-bottom:10px"><div class="wp-logo">${icon('wp')}</div><div style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(wp.name || 'Your website')}</b><div class="row-meta" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((wp.url || S.state.wp_url || 'Not configured').replace(/^https?:\/\//, ''))}</div></div></div>
        <div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn sm" data-act="wp-test" data-busy="Testing…" style="flex:1;justify-content:center">${icon('bolt')}Test Connection</button><button class="btn sm" data-act="wp-connect-modal">${icon('gear')}Manage</button></div>
        ${wp.connected ? `<div class="section-title" style="font-size:13px;margin:12px 0 6px">Site Information</div><div class="wp-stats" style="text-align:left"><div><span>Posts Today</span><b>${wp.today ?? '—'}</b></div><div style="padding-left:12px"><span>Total Posts</span><b>${wp.total ?? '—'}</b></div><div style="padding-left:12px"><span>WordPress</span><b>${esc(wp.version || '—')}</b></div></div>${wp.error ? `<div class="alert err" style="margin:0">${esc(wp.error)}</div>` : ''}`
        : `<div class="alert info" style="margin:0">${icon('info')}<div>Connect with an Application Password to publish from here.</div></div><button class="btn primary block" data-act="wp-connect-modal" style="margin-top:10px">${icon('key')}Connect WordPress</button>`}
      </div>
      <div class="card section"><div class="section-title" style="margin-bottom:12px">Default Publish Settings</div>
        <div class="field-row"><div class="field"><label>Post Status</label><select class="select" style="width:100%" data-set="publish.post_status">${[['publish', 'Publish Immediately'], ['draft', 'Save as Draft'], ['future', 'Schedule (ask for date)']].map(([v, l]) => `<option value="${v}" ${pub.post_status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Author</label><select class="select" style="width:100%" data-set="publish.author"><option value="">Default (connected user)</option>${(S.wpLists?.authors || []).map(u => `<option value="${u.id}" ${pub.author == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div></div>
        <div class="field-row"><div class="field"><label>Default Category</label><input class="input mr" list="wp-cats" data-set="publish.default_category" value="${esc(pub.default_category || '')}" placeholder="e.g. चालू घडामोडी"><datalist id="wp-cats">${(S.wpLists?.categories || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label>Default Tags</label><input class="input mr" data-set="publish.default_tags" value="${esc(pub.default_tags || '')}" placeholder="comma separated"></div></div>
        <div class="row-meta">These settings are used for new articles. Changes save automatically.</div></div>
      <div class="card section"><div class="section-title" style="margin-bottom:6px">Publishing Options</div>
        ${[['featured_image', 'Set Featured Image', 'image'], ['rankmath_meta', 'Add Meta Title & Description (Rank Math)', 'tagi'], ['auto_draft', 'Auto-save draft to WordPress after writing', 'send']].map(([k, l, ic]) => `<div class="switch-row"><div class="sl">${icon(ic)}${l}</div><button class="switch ${pub[k] ? 'on' : ''}" data-act="set-toggle" data-key="publish.${k}"></button></div>`).join('')}
        <div class="switch-row"><div class="sl">${icon('link')}Auto Internal Links</div><button class="switch ${S.settings.seo.internal_links ? 'on' : ''}" data-act="set-toggle" data-key="seo.internal_links"></button></div></div>
      <div class="card section" style="background:linear-gradient(135deg,#eff6ff,#f5f3ff)"><div class="tcell" style="margin-bottom:10px"><div class="src-logo" style="background:#fff;color:var(--primary)">${icon('rocket')}</div><div><b>Bulk Publishing</b><div class="row-meta">Publish multiple approved articles at once.</div></div></div>
        <button class="btn primary block" data-act="wp-publish-approved" data-busy="Publishing…" ${approved.length ? '' : 'disabled'}>${icon('send')}Publish ${S.asel.size ? 'Selected' : 'Approved'} Articles (${S.asel.size || approved.length})</button></div>
    </div>
  </div>`, first);
  renderBulk();
  bindSettingsInputs();
};
function bindSettingsInputs() {
  $$('[data-set]').forEach(el => el.onchange = async () => {
    const [sec, key] = el.dataset.set.split('.');   // "publish.author" -> nested, "model" -> top level
    let v = el.value; if (key === 'author') v = v ? +v : null; if (sec === 'writers') v = +v;
    S.settings = await api('/api/settings', { method: 'POST', body: key ? { [sec]: { [key]: v } } : { [sec]: v } });
    toast('ok', 'Setting saved');
  });
}
ACTIONS['set-toggle'] = async el => {
  const [sec, key] = el.dataset.key.split('.');
  const v = !el.classList.contains('on'); el.classList.toggle('on', v);
  S.settings = await api('/api/settings', { method: 'POST', body: { [sec]: { [key]: v } } });
  toast('ok', 'Setting saved');
};
ACTIONS['wp-tab'] = el => { S.ui.wpTab = el.dataset.v; ROUTES.wordpress(false); };
ACTIONS['wp-test'] = async el => { await busy(el, async () => { try { const d = await api('/api/wordpress/test', { method: 'POST' }); S.wp = d; toast('ok', 'Connection OK', `${d.name || d.url} · ${d.total} posts`); } catch (e) { toast('err', 'Connection failed', e.message); } }); rerender(); };
ACTIONS['wp-publish-approved'] = el => runBulk('publish', S.asel.size ? [...S.asel] : S.articles.filter(a => a.status === 'approved').map(a => a.id), el);
ACTIONS['wp-schedule'] = (el, e) => {
  e.stopPropagation();
  const id = el.dataset.id, def = new Date(Date.now() + 36e5 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const m = modal(`<h3>Schedule publication</h3><p>The post is created on WordPress with status “Scheduled” and goes live at this time (site timezone).</p><div class="field"><label>Publish at</label><input class="input" type="datetime-local" id="sch-when" value="${def}"></div><div class="mbtns"><button class="btn" data-x>Cancel</button><button class="btn primary" id="sch-ok" data-busy="Scheduling…">${icon('calendar')}Schedule</button></div>`, 'sm');
  $('[data-x]', m).onclick = closeModal;
  // WordPress rejects a post date without seconds ("2026-10-05T15:25"), so add them
  $('#sch-ok', m).onclick = () => { const v = $('#sch-when', m).value; closeModal(); runBulk('schedule', [id], null, { when: v.length === 16 ? `${v}:00` : v }); };
};
ACTIONS['wp-connect-modal'] = async () => {
  const cfg = await api('/api/wordpress');
  const m = modal(`<h3>WordPress connection</h3><p>Use an <b>Application Password</b> (WordPress → Users → Profile → Application Passwords). It is not your normal login password and can be revoked anytime.</p>
    <form id="wp-form"><div class="field"><label>Website URL</label><input class="input" name="url" value="${esc(cfg.url || S.state.wp_url || 'https://mpscsuccess.com')}"></div>
    <div class="field"><label>Username</label><input class="input" name="user" value="${esc(cfg.user_login || '')}" autocomplete="username"></div>
    <div class="field"><label>Application password</label><input class="input" type="password" name="password" placeholder="${cfg.has_password ? '•••••••••• (saved — leave empty to keep)' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}" autocomplete="new-password"></div>
    <div id="wp-result"></div><div class="mbtns"><button type="button" class="btn" data-x>Cancel</button><button class="btn primary" data-busy="Testing connection…">${icon('bolt')}Test &amp; Save</button></div></form>`);
  $('[data-x]', m).onclick = closeModal;
  $('#wp-form', m).onsubmit = e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      try { const r = await api('/api/wordpress/connect', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('ok', 'WordPress connected', `Logged in as ${r.name}`); await Promise.all([loadState(), loadWp()]); updateNav(); rerender(); }
      catch (err) { $('#wp-result', m).innerHTML = `<div class="alert err">${icon('alert')}<div>${esc(err.message)}</div></div>`; hydrate(m); }
    });
  };
};

// ------------------------------------------------------------------ CLAUDE CONFIGURATION
ROUTES.claude = async function (first) {
  if (first) { await Promise.all([loadTemplates(), loadSettings(), loadClaude(), api('/api/stats/claude').then(d => { S.claudeStats = d; })]); S.ui.tpl = (S.templates.find(t => t.default) || S.templates[0])?.id; S.ui.claudeTab = 'prompt'; S.ui.testOut = null; }
  const c = S.claude || {}, st = S.claudeStats || {}, q = S.settings.quick;
  const tpl = S.templates.find(t => t.id === S.ui.tpl) || S.templates[0];
  const modelName = m => ({ '': 'Claude Code default', opus: 'Claude Opus', sonnet: 'Claude Sonnet', haiku: 'Claude Haiku' }[m] || m);
  const vars = [['{title}', 'Article title from source'], ['{source}', 'Source name (e.g. PIB)'], ['{extracted_content}', 'Original extracted content'], ['{category}', 'Article category'], ['{date}', 'Publication date'], ['{url}', 'Original source URL']];
  paint(`
  ${pageHead({ crumb: 'Claude AI Configuration', icon: 'spark', color: 'g-orange', title: 'Claude AI Configuration', sub: 'Configure AI prompts, article structure, tone and output settings for high-quality, SEO-friendly content.',
    right: `<button class="btn lg" data-act="tpl-test-open">${icon('test')}Test Prompt</button><button class="btn primary lg" data-act="tpl-save" data-busy="Saving…">${icon('save')}Save Configuration</button>` })}
  <div class="kpis four stagger">
    ${kpi({ g: 'violet', ic: 'brain', val: modelName(S.settings.model), label: 'Default Model', note: c.logged_in ? `Claude Code · ${esc(c.plan || '')} plan` : 'Claude Code not logged in', trend: c.logged_in ? 'up' : 'down', small: true })}
    ${kpi({ g: 'blue', ic: 'file', val: st.generated_month ?? 0, label: 'Articles Generated', note: `This month · ${st.generated_total ?? 0} in total` })}
    ${kpi({ g: 'green', ic: 'award', val: `${st.avg_seo ?? 0}/100`, label: 'Average SEO Score', note: 'Across generated articles' })}
    ${kpi({ g: 'orange', ic: 'clock', val: st.avg_seconds ? fmtSecs(st.avg_seconds) : '2–5 min', label: 'Processing Time', note: 'per article', small: true })}
  </div>
  <div class="card" style="overflow:hidden">
    <div class="editor-tabs">${[['prompt', 'Prompt Configuration'], ['structure', 'Article Structure'], ['style', 'Writing Style'], ['advanced', 'Advanced Settings']].map(([k, l]) => `<button class="${S.ui.claudeTab === k ? 'on' : ''}" data-act="claude-tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${S.ui.claudeTab === 'prompt' ? `<div style="display:grid;grid-template-columns:300px minmax(0,1fr) 340px;gap:0">
      <div style="padding:18px;border-right:1px solid var(--line2)"><div class="section-head"><div class="section-title" style="font-size:14px">Prompt Templates</div><button class="btn sm primary" data-act="tpl-new">${icon('plus')}New</button></div>
        ${S.templates.map(t => `<div class="tpl-item ${t.id === tpl?.id ? 'on' : ''}" data-act="tpl-pick" data-id="${t.id}"><div class="ti" style="background:${colorFor(t.name)[0]};color:${colorFor(t.name)[1]}">${icon('file')}</div><div style="flex:1;min-width:0"><b>${esc(t.name)} ${t.default ? '<span class="badge b-live" style="padding:1px 7px;font-size:10px">Default</span>' : ''}</b><span>${esc(t.description || '')}</span></div></div>`).join('')}</div>
      <div style="padding:18px;border-right:1px solid var(--line2)"><div class="section-title" style="font-size:14px;margin-bottom:12px">Edit Prompt Template</div>
        <div class="field-row"><div class="field"><label>Template Name <em>*</em></label><input class="input" id="t-name" value="${esc(tpl?.name || '')}"></div><div class="field"><label>Model</label><select class="select" id="t-model" style="width:100%">${[['', 'Use default model'], ['opus', 'Claude Opus'], ['sonnet', 'Claude Sonnet'], ['haiku', 'Claude Haiku']].map(([v, l]) => `<option value="${v}" ${(tpl?.model || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="field"><label>Description</label><input class="input" id="t-desc" value="${esc(tpl?.description || '')}"></div>
        <div class="field"><div style="display:flex;justify-content:space-between;align-items:center"><label>System Prompt / Instructions <em>*</em></label><button class="btn sm" data-act="tpl-default">${icon('check')}Set as default</button></div><textarea class="input code mr" id="t-system" rows="16">${esc(tpl?.system || '')}</textarea><div class="counter">${(tpl?.system || '').length} characters</div></div>
        <div class="field"><div style="display:flex;justify-content:space-between;align-items:center"><label>User Prompt Template <em>*</em></label><span class="row-meta">Click a variable on the right to insert</span></div><textarea class="input code" id="t-user" rows="10">${esc(tpl?.user || '')}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:space-between"><button class="btn danger" data-act="tpl-delete" ${S.templates.length > 1 ? '' : 'disabled'}>${icon('trash')}Delete template</button><button class="btn primary" data-act="tpl-save" data-busy="Saving…">${icon('save')}Save template</button></div></div>
      <div style="padding:18px"><div class="section-head"><div class="section-title" style="font-size:14px">Preview Output</div><button class="btn sm violet" data-act="tpl-test-open">${icon('play')}Run Test</button></div>
        <div id="test-out">${S.ui.testOut ? testOutput(S.ui.testOut) : `<div class="empty" style="padding:30px 10px">Run a test to see a real article generated with this template (takes 2–5 minutes).</div>`}</div>
        <div class="section-title" style="font-size:13px;margin:16px 0 6px">Variables You Can Use</div>${vars.map(([v, d]) => `<div class="var-row"><span class="var" data-act="tpl-var" data-v="${v}">${v}</span>${d}</div>`).join('')}</div>
    </div>` : ''}
    ${S.ui.claudeTab === 'structure' ? `<div class="editor-body"><div class="section-title" style="margin-bottom:6px">Article Structure</div><div class="row-meta" style="margin-bottom:12px">These switches add rules to every prompt. The order of sections comes from the system prompt.</div>
      ${[['highlights', 'Include Key Highlights Box', 'One-liner exam facts table'], ['mcq', 'Include MCQ Section', '3–5 multiple-choice questions with answers'], ['faq', 'Include FAQ Section', '2–3 questions'], ['meta_description', 'Generate Meta Description', '140–160 characters with focus keyword'], ['internal_links', 'Add Internal Linking Suggestions', 'Links to older posts of your site']].map(([k, l, d]) => `<div class="switch-row"><div><b>${l}</b><div class="row-meta">${d}</div></div><button class="switch ${q[k] ? 'on' : ''}" data-act="set-toggle" data-key="quick.${k}"></button></div>`).join('')}
      <div class="field" style="margin-top:16px"><label>Default Article Length</label><select class="select" data-set="content.length">${[['short', 'Short (500–800 words)'], ['medium', 'Medium (800–1200 words)'], ['long', 'Long (1500–2000 words)']].map(([v, l]) => `<option value="${v}" ${S.settings.content.length === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>` : ''}
    ${S.ui.claudeTab === 'style' ? `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">Writing Style</div>
      <div class="field"><label>Extra style instruction</label><textarea class="input mr" rows="3" data-set="content.language_note" placeholder="e.g. वाक्ये लहान ठेवा; प्रत्येक विभागात एक उदाहरण द्या">${esc(S.settings.content.language_note || '')}</textarea></div>
      <div class="field"><label>Disclaimer paragraph (appended at the end)</label><textarea class="input mr" rows="3" data-set="content.disclaimer" placeholder="Leave empty for none">${esc(S.settings.content.disclaimer || '')}</textarea></div>
      <div class="switch-row"><div><b>Include Source Link</b><div class="row-meta">Add a “स्रोत” line with the original URL</div></div><button class="switch ${S.settings.content.source_link ? 'on' : ''}" data-act="set-toggle" data-key="content.source_link"></button></div>
      <div class="alert info" style="margin-top:14px">${icon('info')}<div>Tone, language and formatting rules live in the <b>System Prompt</b> of the template — edit them under Prompt Configuration.</div></div></div>` : ''}
    ${S.ui.claudeTab === 'advanced' ? `<div class="editor-body"><div class="section-title" style="margin-bottom:12px">Advanced Settings</div>
      <div class="field-row"><div class="field"><label>Default model</label><select class="select" style="width:100%" data-set="model">${[['', 'Claude Code default'], ['opus', 'Claude Opus'], ['sonnet', 'Claude Sonnet'], ['haiku', 'Claude Haiku']].map(([v, l]) => `<option value="${v}" ${S.settings.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="hint">Models come from your Claude subscription through Claude Code — no API key is used.</div></div>
      <div class="field"><label>Parallel writers</label><select class="select" style="width:100%" data-set="writers">${[1, 2, 3, 4].map(n => `<option value="${n}" ${S.settings.writers == n ? 'selected' : ''}>${n} article${n > 1 ? 's' : ''} at a time</option>`).join('')}</select><div class="hint">More writers = faster, but heavier on your plan's usage limits.</div></div></div>
      <div class="card section" style="box-shadow:none"><div class="section-head"><div class="section-title">${icon('spark')}Claude Code</div>${c.logged_in ? '<span class="badge b-live"><span class="bd"></span>Logged in</span>' : '<span class="badge b-failed">Not logged in</span>'}</div>
        ${c.logged_in ? `<div class="kv-grid"><dt>Plan</dt><dd>${esc(c.plan || '—')}</dd><dt>Status</dt><dd>Ready</dd></div>` : c.installed === false ? `<div class="alert warn">${icon('alert')}<div>Claude Code is not installed on this laptop.</div></div>` : `<div class="alert warn">${icon('alert')}<div>Claude is not logged in, so articles cannot be written.</div></div>`}
        <div style="display:flex;gap:8px;margin-top:10px">${c.installed !== false && !c.logged_in ? `<button class="btn primary" data-act="claude-login" data-busy="Opening…">${icon('key')}Log in to Claude</button>` : ''}<button class="btn" data-act="claude-recheck" data-busy="Checking…">${icon('refresh')}Check again</button></div></div></div>` : ''}
  </div>
  <div class="grid-3">
    <div class="card section"><div class="tcell" style="margin-bottom:10px"><div class="src-logo" style="background:#eff6ff;color:var(--primary)">${icon('gear')}</div><b>Quick Settings</b></div>${[['faq', 'Include FAQ Section'], ['meta_description', 'Generate Meta Description'], ['internal_links', 'Add Internal Linking Suggestions'], ['highlights', 'Include Key Highlights Box']].map(([k, l]) => `<div class="switch-row"><div class="sl">${l}</div><button class="switch ${q[k] ? 'on' : ''}" data-act="set-toggle" data-key="quick.${k}"></button></div>`).join('')}</div>
    <div class="card section"><div class="tcell" style="margin-bottom:10px"><div class="src-logo" style="background:#ecfdf5;color:var(--success-ink)">${icon('file')}</div><b>Content Guidelines</b></div><div class="check-list">${['Facts only from the source — no invented numbers or dates', 'Rewrite in original Marathi, never translate verbatim', 'Exam-oriented: highlights, MCQs, FAQ', 'Categories only from your website', 'Internal links only to real posts', 'Neutral tone, no coaching-institute promotion'].map(t => `<div class="ok">${icon('check')}<span>${t}</span></div>`).join('')}</div></div>
    <div class="card section"><div class="tcell" style="margin-bottom:10px"><div class="src-logo" style="background:#fdf2f8;color:#be185d">${icon('code')}</div><b>What Claude receives</b></div><div class="check-list">${['System prompt of the default template + output rules', 'User prompt with the extracted source content', 'Your site categories and 150 recent posts', 'A strict JSON schema (title, HTML, excerpt, keyword, tags, slug, categories)'].map(t => `<div class="ok">${icon('check')}<span>${t}</span></div>`).join('')}</div></div>
  </div>`, first);
  bindSettingsInputs();
  const sys = $('#t-system'); if (sys) sys.oninput = () => { sys.nextElementSibling.textContent = `${sys.value.length} characters`; };
};
function testOutput(o) {
  if (o.error) return `<div class="alert err">${icon('alert')}<div>${esc(o.error)}</div></div>`;
  if (o.running) return `<div class="writing" style="padding:26px 10px"><div class="orb" style="width:56px;height:56px"></div><b>Claude is writing a test article…</b><div class="row-meta">Usually 2–5 minutes. Started ${fmtTime(o.started)}.</div></div>`;
  const a = o.article;
  return `<div class="live-prev"><div class="lp-body">${catPill(a.categories[0])}<h2 class="mr">${esc(a.title)}</h2><div class="lp-meta"><span>${esc(o.item.source)}</span><span>${fmtSecs(o.seconds)}</span><span>${a.content_html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length} words</span></div>${o.image ? `<img class="lp-img" src="${esc(o.image)}">` : ''}<div class="lp-content mr">${a.content_html}</div></div></div>
    <details style="margin-top:10px"><summary class="link">Raw JSON response</summary><pre class="prompt-box" style="font-size:11px;max-height:300px;overflow:auto">${esc(JSON.stringify(a, null, 2))}</pre></details>`;
}
function tplFromForm() { return { id: S.ui.tpl, name: $('#t-name')?.value, description: $('#t-desc')?.value, model: $('#t-model')?.value, system: $('#t-system')?.value, user: $('#t-user')?.value }; }
ACTIONS['claude-tab'] = el => { S.ui.claudeTab = el.dataset.v; ROUTES.claude(false); };
ACTIONS['tpl-pick'] = el => { S.ui.tpl = el.dataset.id; ROUTES.claude(false); };
ACTIONS['tpl-new'] = async () => { const t = await api('/api/templates', { method: 'POST', body: { name: 'New Template', description: 'Describe when to use this template', system: S.templates[0]?.system || '', user: S.templates[0]?.user || '' } }); await loadTemplates(); S.ui.tpl = t.id; ROUTES.claude(false); };
ACTIONS['tpl-save'] = async el => { if (!$('#t-name')) { S.ui.claudeTab = 'prompt'; ROUTES.claude(false); return; } await busy(el, async () => { await api('/api/templates', { method: 'POST', body: tplFromForm() }); await loadTemplates(); }); toast('ok', 'Template saved'); ROUTES.claude(false); };
ACTIONS['tpl-default'] = async () => { await api('/api/templates', { method: 'POST', body: { ...tplFromForm(), default: true } }); await loadTemplates(); toast('ok', 'Default template updated'); ROUTES.claude(false); };
ACTIONS['tpl-delete'] = async () => { if (!await confirmBox({ title: 'Delete this template?', text: 'Articles already written are not affected.', ok: 'Delete', kind: 'danger-solid' })) return; await api(`/api/templates/${S.ui.tpl}`, { method: 'DELETE' }); await loadTemplates(); S.ui.tpl = S.templates[0]?.id; ROUTES.claude(false); };
ACTIONS['tpl-var'] = el => { const ta = $('#t-user'); if (!ta) return; const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + el.dataset.v + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = s + el.dataset.v.length; };
ACTIONS['claude-recheck'] = async el => { await busy(el, () => loadClaude(true)); updateNav(); rerender(); };
ACTIONS['tpl-test-open'] = () => {
  const sample = S.claudeStats?.sample || [];
  const m = modal(`<h3>Test prompt</h3><p>Pick a real news item. Claude writes a full article with the template currently in the editor (unsaved changes included). Takes 2–5 minutes and uses your plan's quota.</p>
    <div class="field"><label>News item</label><select class="select" id="test-item" style="width:100%">${sample.map((s, i) => `<option value="${i}">${esc(s.source)} · ${esc(s.title.slice(0, 80))}</option>`).join('')}</select></div>
    <div class="mbtns"><button class="btn" data-x>Cancel</button><button class="btn violet" id="test-run">${icon('play')}Run Test</button></div>`);
  $('[data-x]', m).onclick = closeModal;
  $('#test-run', m).onclick = async () => {
    const item = sample[+$('#test-item', m).value]; closeModal();
    if (!$('#t-system')) { S.ui.claudeTab = 'prompt'; await ROUTES.claude(false); }
    const body = { ...tplFromForm(), item };
    S.ui.testOut = { running: true, started: new Date().toISOString(), item }; $('#test-out').innerHTML = testOutput(S.ui.testOut);
    try { const r = await api('/api/templates/test', { method: 'POST', body }); S.ui.testOut = { ...r, item }; toast('ok', 'Test article ready', `${fmtSecs(r.seconds)}`); }
    catch (e) { S.ui.testOut = { error: e.message, item }; }
    const box = $('#test-out'); if (box) { box.innerHTML = testOutput(S.ui.testOut); hydrate(box); }
  };
};
