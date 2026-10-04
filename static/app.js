/* CurrentFlow — core: icons, helpers, state, router, toasts, bulk actions. Pages live in pages1.js / pages2.js */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bank: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  tick: '<path d="M20 6 9 17l-5-5"/>',
  'file-check': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
  wp: '<circle cx="12" cy="12" r="10"/><path d="M3.6 8.6 8.2 20.4M7.8 7.6h4.6M10 7.6l4.4 12.6L18.4 8.4M14.8 7.6h4"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  flow: '<path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  brain: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4 17.5a2.5 2.5 0 0 1-1.5-4.5A2.5 2.5 0 0 1 3 8.5 2.5 2.5 0 0 1 7 4.5 2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 20 17.5a2.5 2.5 0 0 0 1.5-4.5A2.5 2.5 0 0 0 21 8.5 2.5 2.5 0 0 0 17 4.5 2.5 2.5 0 0 0 14.5 2z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  up: '<path d="M7 17 17 7M7 7h10v10"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
  pause: '<circle cx="12" cy="12" r="10"/><path d="M10 9v6M14 9v6"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tagi: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  desktop: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  mobile: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  underline: '<path d="M6 3v7a6 6 0 0 0 12 0V3M4 21h16"/>',
  ul: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  ol: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.3-1-2-2-2H4c-1 0-2 .7-2 2v6c0 1 1 2 2 2h4M15 21c3 0 7-1 7-8V5c0-1.3-1-2-2-2h-4c-1 0-2 .7-2 2v6c0 1 1 2 2 2h4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  test: '<path d="M9 3h6M10 3v6.5L4.6 19a1.5 1.5 0 0 0 1.3 2.3h12.2a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const icon = n => `<i data-i="${n}"><svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg></i>`;
const hydrate = (root = document) => root.querySelectorAll('i[data-i]:empty').forEach(el => { el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[el.dataset.i] || ''}</svg>`; });

// ------------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA');
const isMarathi = s => /[ऀ-ॿ]/.test(s || '');
const mr = s => isMarathi(s) ? 'mr' : '';
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';
const fmtSecs = s => !s ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers = { 'Content-Type': 'application/json' }; }
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const fmtDate = iso => iso ? new Date(iso.length === 10 ? iso + 'T00:00' : iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtDT = iso => iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '—';

const PALETTE = [['#dbeafe', '#1d4ed8'], ['#d1fae5', '#047857'], ['#ede9fe', '#6d28d9'], ['#ffedd5', '#c2410c'], ['#fce7f3', '#be185d'], ['#ccfbf1', '#0f766e'], ['#fef9c3', '#a16207'], ['#e0e7ff', '#4338ca']];
const colorFor = name => { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const initials = name => String(name || '?').replace(/[()]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const srcLogo = (name, sm = '') => { const [bg, fg] = colorFor(name); return `<div class="src-logo ${sm}" style="background:${bg};color:${fg}">${esc(initials(name))}</div>`; };
const srcBadge = name => { const [bg, fg] = colorFor(name); return `<span class="badge" style="background:${bg};color:${fg}">${esc(name)}</span>`; };
const catPill = name => { if (!name) return ''; const [bg, fg] = colorFor(name + 'cat'); return `<span class="cat" style="background:${bg};color:${fg}">${esc(name)}</span>`; };

const STATUS = {
  selected: ['b-selected', 'Selected'], extracted: ['b-extracted', 'Extracted'], queued: ['b-waiting', 'Waiting'],
  paused: ['b-paused', 'Paused'], writing: ['b-processing', 'Processing'], ready: ['b-review', 'Review'],
  changes: ['b-changes', 'Needs changes'], approved: ['b-approved', 'Approved'], rejected: ['b-rejected', 'Rejected'],
  draft: ['b-draft', 'Draft'], scheduled: ['b-scheduled', 'Scheduled'], published: ['b-live', 'Live'], error: ['b-failed', 'Failed'],
};
const badge = st => { const [c, l] = STATUS[st] || ['b-queued', st]; return `<span class="badge ${c}"><span class="bd"></span>${l}</span>`; };
function stageOf(a) {
  if (a.status === 'queued' || a.status === 'paused') return ['Waiting', 0, 'sp-wait'];
  if (a.status === 'writing') return { fetching: ['Extracting', 25, 'sp-extract'], writing: ['Claude AI', 60, 'sp-claude'], uploading: ['Uploading', 90, 'sp-upload'] }[a.step] || ['Claude AI', 60, 'sp-claude'];
  if (a.status === 'error') return ['Failed', 0, 'sp-fail'];
  if (a.status === 'selected') return ['Not extracted', 0, 'sp-wait'];
  if (a.status === 'extracted') return ['Extracted', 20, 'sp-extract'];
  return ['Completed', 100, 'sp-done'];
}
function thumb(a, cls = 'thumb') {
  if (a.has_image) return `<img class="${cls}" src="/image/${a.id}?v=${encodeURIComponent(a.updated || '')}" alt="" loading="lazy">`;
  const [bg, fg] = colorFor(a.source?.source || a.title);
  return `<div class="${cls} ph-thumb" style="background:linear-gradient(135deg,${fg},${bg})">${esc(initials(a.source?.source || 'CA'))}</div>`;
}
const ring = (score, sm = false) => { const col = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'; return `<div class="ring ${sm ? 'sm' : ''}" style="--p:${score};--ring:${col}"><div><b>${score}</b>${sm ? '' : '<span>/ 100</span>'}</div></div>`; };

// ------------------------------------------------------------------ state
const S = {
  state: {}, titles: { items: [], errors: {}, stats: {} }, articles: [], counts: {}, sources: [], wp: null, claude: null,
  settings: null, templates: [], sel: new Map(), asel: new Set(), route: 'dashboard', param: null, lastStatus: {}, current: null,
  feed: { q: '', src: '', cat: '', when: 'today', page: 1, sort: 'latest', preview: null },
  ui: {},
};
const byId = id => S.articles.find(a => a.id === id);
const isWorking = a => ['queued', 'writing'].includes(a.status);
const inReview = a => ['ready', 'changes', 'approved', 'rejected', 'draft', 'scheduled'].includes(a.status);

async function loadState() { S.state = await api('/api/state'); }
async function loadTitles() { S.titles = await api('/api/titles'); }
async function loadSources() { const d = await api('/api/sources'); S.sources = d.items; S.sourceCats = d.categories; }
async function loadWp() { S.wp = await api('/api/wordpress').catch(() => ({ connected: false })); }
async function loadClaude(fresh) { S.claude = await api('/api/claude/status' + (fresh ? '?fresh=1' : '')).catch(() => ({ logged_in: false })); }
async function loadSettings() { S.settings = await api('/api/settings'); }
async function loadTemplates() { S.templates = (await api('/api/templates')).items; }
async function loadArticles() {
  const d = await api('/api/articles');
  for (const a of d.items) {
    const prev = S.lastStatus[a.id];
    if (prev && prev !== a.status) {
      if (a.status === 'ready' && prev === 'writing') toast('ok', 'Article ready for review', a.title);
      if (a.status === 'error' && prev !== 'error') toast('err', 'Processing failed', a.error || a.title);
    }
    S.lastStatus[a.id] = a.status;
  }
  S.articles = d.items; S.counts = d.counts;
  updateNav();
}

function updateNav() {
  const c = S.counts || {};
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v || ''; };
  set('#nc-queue', c.working); set('#nc-review', c.review); set('#nc-selected', c.pending);
  set('#nc-discover', S.titles.items.filter(t => t.date === today() && !t.article_id).length);
  set('#nc-sources', S.state.sources_active);
  const wpOn = S.state.wp_ready;
  const used = S.state.storage_bytes || 0, cap = 10e9, pct = Math.min(100, Math.round(used / cap * 100));
  const plan = S.claude?.plan || S.state.claude_plan || '';
  $('#side-foot').innerHTML = `<div class="side-card"><b><span class="dot ${wpOn ? 'on' : 'off'}"></span>${wpOn ? 'WordPress connected' : 'WordPress not connected'}</b>${wpOn ? esc((S.state.wp_url || '').replace(/^https?:\/\//, '')) : '<a class="link" href="#/wordpress" style="color:#93c5fd">Connect now →</a>'}</div>`;
  hydrate($('#side-foot'));
  const name = S.state.user_name || 'Admin';
  $('#who-name').textContent = name; $('#who-avatar').textContent = initials(name);
}

// ------------------------------------------------------------------ toasts, modal, confirm, busy
function toast(type, title, msg = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="ti">${icon(type === 'ok' ? 'tick' : type === 'err' ? 'x' : 'bolt')}</div><div><b>${esc(title)}</b>${msg ? `<span class="${mr(msg)}">${esc(msg)}</span>` : ''}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 7000 : 4200);
}
function modal(html, cls = '') {
  const bg = $('#modal');
  bg.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  hydrate(bg); bg.classList.add('show');
  return bg.firstElementChild;
}
function closeModal() { $('#modal').classList.remove('show'); $('#modal').innerHTML = ''; }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('#notif').classList.remove('show'); } });
function confirmBox({ title, text, ok = 'Confirm', kind = 'primary' }) {
  return new Promise(resolve => {
    const m = modal(`<h3>${esc(title)}</h3><p>${text}</p><div class="mbtns"><button class="btn" data-x="0">Cancel</button><button class="btn ${kind}" data-x="1">${esc(ok)}</button></div>`, 'sm');
    m.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) { closeModal(); resolve(b.dataset.x === '1'); } });
  });
}
async function busy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${btn.dataset.busy || 'Working…'}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; hydrate(btn); }
}

// ------------------------------------------------------------------ page building blocks
const ROUTES = {}, ACTIONS = {};
function paint(html, animate) {
  const y = window.scrollY;
  view.innerHTML = html; hydrate(view);
  if (animate) { view.classList.remove('fade-up'); void view.offsetWidth; view.classList.add('fade-up'); }
  else window.scrollTo(0, y);
}
const errorBox = msg => `<div class="alert err">${icon('alert')}<div><b>Something went wrong</b><br>${esc(msg)}</div></div>`;
const empty = (ic, title, text, action = '') => `<div class="empty"><div class="ico">${icon(ic)}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
const crumbs = (...parts) => `<div class="crumbs"><a href="#/dashboard">Home</a>${parts.map(p => ` › ${esc(p)}`).join('')}</div>`;
const pageHead = ({ crumb, icon: ic, color, title, sub, right = '' }) => `${crumb ? crumbs(crumb) : ''}<div class="page-head"><div class="ph-left">${ic ? `<div class="ph-icon ${color}">${icon(ic)}</div>` : ''}<div><h1>${title}</h1><div class="subtitle">${sub}</div></div></div><div class="head-right">${right}</div></div>`;
function kpi({ href, g, ic, val, label, note = '', trend = '', small = false }) {
  const t = trend === 'up' ? 'up' : trend === 'down' ? 'down' : '';
  const tag = href ? 'a' : 'div';
  return `<${tag} class="card kpi c-${g}" ${href ? `href="${href}"` : ''}><div class="kpi-icon g-${g}">${icon(ic)}</div><div><div class="kpi-value ${small ? 'sm' : ''}">${val}</div><div class="kpi-label">${label}</div>${note ? `<div class="kpi-note ${t}">${t ? icon(t === 'up' ? 'up' : 'chev') : ''}${note}</div>` : ''}</div></${tag}>`;
}
function trendNote(now, prev, what = 'vs yesterday') {
  if (!prev && !now) return { note: `No ${what.replace('vs ', '')} data`, trend: '' };
  if (!prev) return { note: `+${now} ${what}`, trend: now ? 'up' : '' };
  const pct = Math.round((now - prev) / prev * 100);
  return { note: `${pct >= 0 ? '+' : ''}${pct}% ${what}`, trend: pct > 0 ? 'up' : pct < 0 ? 'down' : '' };
}
function pager(total, page, per, act) {
  const pages = Math.max(1, Math.ceil(total / per));
  const start = Math.min(total, (page - 1) * per + 1), end = Math.min(total, page * per);
  let btns = '';
  for (let p = 1; p <= pages; p++) if (pages <= 7 || Math.abs(p - page) < 3 || p === 1 || p === pages) btns += `<button class="${p === page ? 'on' : ''}" data-act="${act}" data-p="${p}">${p}</button>`;
  const scope = act.replace('-page', '');
  return `<div class="pager"><span>Showing ${start} to ${end} of ${total}</span><div class="pages"><button data-act="${act}" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>${btns}<button data-act="${act}" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button></div><div class="per">Show <select class="select" data-act="per-page" data-scope="${scope}" onchange="ACTIONS['per-page'](this)">${[10, 25, 50].map(n => `<option ${per === n ? 'selected' : ''}>${n}</option>`).join('')}</select> per page</div></div>`;
}

// ------------------------------------------------------------------ router
async function go() {
  const [r, p] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  S.route = ROUTES[r] ? r : 'dashboard'; S.param = p ? decodeURIComponent(p) : null;
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === S.route || (S.route === 'article' && a.dataset.route === 'review')));
  $('#sidebar').classList.remove('open'); $('#notif').classList.remove('show');
  renderBulk();
  view.innerHTML = `<div class="skel" style="width:40%;height:34px"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  window.scrollTo(0, 0);
  try { await ROUTES[S.route](true); } catch (e) { console.error(e); view.innerHTML = errorBox(e.message); }
}
window.addEventListener('hashchange', go);
const rerender = () => ROUTES[S.route] && ROUTES[S.route](false);

// ------------------------------------------------------------------ bulk actions
function renderBulk() {
  const bar = $('#bulkbar');
  let html = '';
  if (S.route === 'discover' && S.sel.size) {
    html = `<span class="cnt"><b>${S.sel.size}</b>selected</span><button class="btn" data-act="clear-sel">Clear</button><button class="btn primary" data-act="add-selection" data-busy="Adding…">${icon('file-check')}Add ${S.sel.size} to Selected Articles</button><button class="btn violet" data-act="add-selection" data-process="1" data-busy="Starting…">${icon('spark')}Process with Claude now</button>`;
  } else if (S.route === 'selected' && S.asel.size) {
    html = `<span class="cnt"><b>${S.asel.size}</b>selected</span><button class="btn danger" data-act="bulk" data-a="delete">${icon('trash')}Remove</button><button class="btn" data-act="bulk" data-a="extract" data-busy="Extracting…">${icon('download')}Extract</button><button class="btn violet" data-act="bulk" data-a="process">${icon('spark')}Process with Claude</button>`;
  } else if (S.route === 'queue' && S.asel.size) {
    html = `<span class="cnt"><b>${S.asel.size}</b>selected</span><button class="btn" data-act="bulk" data-a="pause">${icon('pause')}Pause</button><button class="btn" data-act="bulk" data-a="resume">${icon('play')}Resume</button><button class="btn" data-act="bulk" data-a="retry">${icon('refresh')}Retry</button><button class="btn danger" data-act="bulk" data-a="delete">${icon('trash')}Remove</button>`;
  } else if ((S.route === 'review' || S.route === 'wordpress') && S.asel.size) {
    html = `<span class="cnt"><b>${S.asel.size}</b>selected</span><button class="btn" data-act="bulk" data-a="approve">${icon('tick')}Approve</button><button class="btn" data-act="bulk" data-a="draft" data-busy="Sending…">${icon('send')}Send as draft</button><button class="btn success" data-act="bulk" data-a="publish" data-busy="Publishing…">${icon('rocket')}Publish ${S.asel.size}</button><button class="btn danger" data-act="bulk" data-a="delete">${icon('trash')}Delete</button>`;
  }
  if (html) { bar.innerHTML = html; hydrate(bar); }
  bar.classList.toggle('show', !!html);
}

const VERBS = { publish: 'published 🚀', draft: 'sent to WordPress as draft', schedule: 'scheduled', retry: 'queued for rewriting', delete: 'removed',
  extract: 'extracted', process: 'queued for Claude AI', pause: 'paused', resume: 'resumed', approve: 'approved', reject: 'rejected', changes: 'marked as needs modification' };

async function runBulk(action, ids, btn, extra = {}) {
  const n = ids.length;
  if (!n) return toast('info', 'Nothing selected');
  if (action === 'publish' && !await confirmBox({ title: `Publish ${n} article${n > 1 ? 's' : ''}?`, text: 'They will go live on your website immediately.', ok: 'Publish now', kind: 'success' })) return;
  if (action === 'delete' && !await confirmBox({ title: `Remove ${n} article${n > 1 ? 's' : ''}?`, text: 'They are removed from this dashboard. Posts already on WordPress are not deleted.', ok: 'Remove', kind: 'danger-solid' })) return;
  const run = async () => {
    const r = await api('/api/articles/bulk', { method: 'POST', body: { action, ids, ...extra } });
    if (r.done.length) toast('ok', `${r.done.length} article${r.done.length > 1 ? 's' : ''} ${VERBS[action] || action}`);
    r.failed.forEach(f => toast('err', 'Could not complete', f.error));
    r.done.forEach(id => S.asel.delete(id));
    return r;
  };
  const r = await busy(btn, run);
  await Promise.all([loadArticles(), loadState()]);
  if (S.route === 'article' || S.route === 'review') { if (action === 'delete' && r.done.includes(S.current?.id)) { S.current = null; location.hash = '#/review'; return; } }
  if (['publish', 'draft', 'schedule'].includes(action)) loadWp();
  rerender();
  return r;
}

// ------------------------------------------------------------------ global events
document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-href]');
  const el = e.target.closest('[data-act]');
  if (!el && nav) { location.hash = nav.dataset.href; return; }
  if (!el) { if (!e.target.closest('#notif,#bell')) $('#notif').classList.remove('show'); return; }
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  try { await fn(el, e); } catch (err) { console.error(err); toast('err', 'Action failed', err.message); }
});
ACTIONS.scan = async el => {
  await busy(el, async () => {
    const d = await api('/api/titles/refresh', { method: 'POST' });
    S.titles = d;
    const errs = Object.keys(d.errors || {});
    toast(errs.length ? 'info' : 'ok', `Scan complete · ${d.items.length} titles`, errs.length ? `Could not read: ${errs.join(', ')}` : 'All sources read successfully');
  });
  await Promise.all([loadState(), loadSources().catch(() => {})]);
  updateNav(); rerender();
};
ACTIONS.bulk = (el) => runBulk(el.dataset.a, [...S.asel], el);
ACTIONS.one = (el, e) => { e.stopPropagation(); return runBulk(el.dataset.a, [el.dataset.id], el); };
ACTIONS['clear-sel'] = () => { S.sel.clear(); rerender(); renderBulk(); };
ACTIONS['toggle-notif'] = () => {};

$('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
function applyTheme(mode) { document.documentElement.dataset.theme = mode; $('#theme-btn').innerHTML = icon(mode === 'dark' ? 'sun' : 'moon'); localStorage.setItem('cf-theme', mode); }
$('#theme-btn').onclick = () => { const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(mode); api('/api/settings', { method: 'POST', body: { app: { theme: mode } } }).catch(() => {}); };
applyTheme(localStorage.getItem('cf-theme') || 'light');
$('#global-search').onsubmit = e => { e.preventDefault(); $('#gsearch').classList.remove('show'); S.feed.q = $('#global-q').value; S.feed.when = 'all'; S.feed.src = ''; S.feed.page = 1; S.route === 'discover' ? rerender() : (location.hash = '#/discover'); };
$('#global-q').addEventListener('input', () => { clearTimeout(S._gs); S._gs = setTimeout(globalSearch, 180); });
$('#global-q').addEventListener('focus', () => { if ($('#global-q').value) globalSearch(); });
document.addEventListener('click', e => { if (!e.target.closest('#gsearch,#global-search')) $('#gsearch').classList.remove('show'); });
async function globalSearch() {
  const q = $('#global-q').value.trim().toLowerCase(), box = $('#gsearch');
  if (q.length < 2) return box.classList.remove('show');
  if (!S.sources.length) await loadSources().catch(() => {});
  if (!S.rules) S.rules = (await api('/api/rules').catch(() => ({ items: [] }))).items;
  const hit = s => (s || '').toLowerCase().includes(q);
  const groups = [
    ['Articles', S.articles.filter(a => hit(a.title) || hit(a.source.title)).slice(0, 5).map(a => ({ t: a.title, s: STATUS[a.status]?.[1] || a.status, h: `#/article/${a.id}` }))],
    ['News feed', S.titles.items.filter(i => hit(i.title)).slice(0, 5).map(i => ({ t: i.title, s: i.source, h: '#/discover', q: i.title }))],
    ['Sources', S.sources.filter(s => hit(s.name) || hit(s.site)).slice(0, 4).map(s => ({ t: s.name, s: s.category, h: '#/sources' }))],
    ['Automation rules', (S.rules || []).filter(r => hit(r.name)).slice(0, 3).map(r => ({ t: r.name, s: r.enabled ? 'Active' : 'Paused', h: '#/automation' }))],
    ['Settings', [['WordPress connection', '#/wordpress'], ['Claude configuration', '#/claude'], ['SEO configuration', '#/seo'], ['Default publishing', '#/settings'], ['Activity logs', '#/logs']].filter(([n]) => hit(n)).map(([n, h]) => ({ t: n, s: 'Page', h }))],
  ].filter(([, items]) => items.length);
  box.innerHTML = groups.length ? groups.map(([g, items]) => `<div class="gh">${g}</div>${items.map(i => `<div class="gi" data-gs="${esc(i.h)}" data-q="${esc(i.q || '')}">${icon(g === 'Articles' ? 'file' : g === 'Sources' ? 'bank' : g === 'News feed' ? 'search' : g === 'Settings' ? 'gear' : 'bolt')}<b class="${mr(i.t)}">${esc(i.t)}</b><span>${esc(i.s)}</span></div>`).join('')}`).join('') : `<div class="empty" style="padding:24px">No results for “${esc(q)}”</div>`;
  hydrate(box); box.classList.add('show');
  box.onclick = e => { const el = e.target.closest('[data-gs]'); if (!el) return; box.classList.remove('show'); if (el.dataset.q) { S.feed.q = el.dataset.q; S.feed.when = 'all'; S.feed.src = ''; S.feed.page = 1; } location.hash = el.dataset.gs; if (location.hash === el.dataset.gs) rerender(); };
}
// sortable table helper: th.sortable[data-key] inside a container with data-sort-scope
function sortList(scope, list, getters) {
  const st = S.ui.sort?.[scope]; if (!st) return list;
  const g = getters[st.key] || (x => x[st.key]);
  return [...list].sort((a, b) => { const va = g(a) ?? '', vb = g(b) ?? ''; const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)); return st.dir === 'asc' ? r : -r; });
}
const th = (scope, key, label) => { const st = S.ui.sort?.[scope]; const on = st?.key === key; return `<th class="sortable ${on ? 'on' : ''}" data-act="sort" data-scope="${scope}" data-key="${key}">${label}<span class="sarrow">${on ? (st.dir === 'asc' ? '▲' : '▼') : '⇅'}</span></th>`; };
ACTIONS.sort = el => { S.ui.sort = S.ui.sort || {}; const cur = S.ui.sort[el.dataset.scope]; S.ui.sort[el.dataset.scope] = cur?.key === el.dataset.key ? { key: el.dataset.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: el.dataset.key, dir: 'asc' }; rerender(); };
const perPage = scope => (S.ui.per && S.ui.per[scope]) || 10;
ACTIONS['per-page'] = el => { S.ui.per = S.ui.per || {}; S.ui.per[el.dataset.scope] = +el.value; rerender(); };
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); $('#global-q').focus(); } });
$('#bell').onclick = async () => {
  const box = $('#notif');
  if (box.classList.contains('show')) return box.classList.remove('show');
  const d = await api('/api/notifications');
  box.innerHTML = `<div class="nh">Notifications</div><div class="nb">${d.items.length ? d.items.map(n => `<div class="ni" data-href="#/article/${n.id}"><div class="dotc" style="background:${n.level === 'err' ? '#ef4444' : '#10b981'}"></div><div><b class="${mr(n.title)}">${esc(n.title)}</b><span>${esc(n.msg)} · ${ago(n.t)}</span></div></div>`).join('') : '<div class="empty" style="padding:30px">No notifications yet</div>'}</div>`;
  box.classList.add('show');
  $('#bell-dot').textContent = '';
};

// live updates while Claude is writing
setInterval(async () => {
  const working = (S.counts.working || 0) > 0;
  if (!working && !['queue', 'selected'].includes(S.route)) return;
  try { await loadArticles(); } catch { return; }
  if (['dashboard', 'queue', 'selected'].includes(S.route)) rerender();
  else if (S.route === 'review' && !S.ui.editing) rerender();
  else if (S.route === 'article' && S.current && isWorking(S.current)) rerender();
}, 4000);
setInterval(async () => { try { const d = await api('/api/notifications'); const errs = d.items.filter(n => n.level === 'err' && Date.now() - new Date(n.t) < 3600e3).length; $('#bell-dot').textContent = errs || ''; } catch {} }, 30000);

// ------------------------------------------------------------------ boot
window.addEventListener('load', async () => {
  hydrate();
  await Promise.all([loadState(), loadTitles(), loadArticles(), loadWp()]).catch(() => {});
  updateNav();
  go();
});
