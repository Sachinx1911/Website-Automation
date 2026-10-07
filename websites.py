"""
Websites: every WordPress site the dashboard writes for. Each has its own niche profile, WordPress connection,
settings overrides (publishing, SEO, content, article structure), default Claude template, news sources and
relevance threshold.

websites.json holds everything except passwords. Each website's WordPress application password lives in .env under
its own key (wp.password_env), so the credentials of one website can never be picked up for another.
"""

import json
import os
import re
import threading
import time
from datetime import datetime
from pathlib import Path

from dotenv import dotenv_values, set_key, unset_key

BASE = Path(__file__).parent
FILE = BASE / "websites.json"
ENV_FILE = BASE / ".env"
CA_DIR = BASE / "ca_articles"
SITE_SECTIONS = ("publish", "seo", "content", "quick")   # settings a website can override; the rest stays global
DEFAULT_THRESHOLD = 75
LIST_FIELDS = ("topics", "keywords", "blocked_topics")
TEXT_FIELDS = ("name", "url", "description", "logo", "niche", "language", "audience", "tone")
_lock = threading.Lock()


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:40] or "website"


def _list(value) -> list[str]:
    if isinstance(value, str):
        value = value.split(",")
    return [str(v).strip() for v in value or [] if str(v).strip()]


# ---------------------------------------------------------------- storage

def _write_json(path: Path, data) -> None:
    """Write through a temp file and a rename, so nobody ever reads a half-written file."""
    path.parent.mkdir(exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    for _ in range(40):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:   # Windows: another thread is reading the file this very moment
            time.sleep(0.05)
    os.replace(tmp, path)


def load() -> list[dict]:
    if not FILE.exists():
        return []
    return json.loads(FILE.read_text(encoding="utf-8"))


def save(items: list[dict]) -> None:
    with _lock:
        _write_json(FILE, items)


def get(wid: str | None) -> dict | None:
    return next((w for w in load() if w["id"] == wid), None) if wid else None


def default() -> dict | None:
    items = load()
    return next((w for w in items if w.get("is_default")), items[0] if items else None)


def site_of(meta: dict) -> dict | None:
    """The website an article belongs to (articles from before multi-website support belong to the default one)."""
    return get(meta.get("website_id")) or default()


def active() -> list[dict]:
    return [w for w in load() if w.get("status", "active") == "active"]


# ---------------------------------------------------------------- WordPress credentials

def wp_config(site: dict | None) -> tuple[str, str, str]:
    """(url, user, application password) of this website only."""
    if not site:
        return "", "", ""
    wp = site.get("wp") or {}
    key = wp.get("password_env") or ""
    password = (dotenv_values(ENV_FILE).get(key) or "").strip() if key and ENV_FILE.exists() else ""
    return (wp.get("url") or "").rstrip("/"), wp.get("user") or "", password


def connected(site: dict | None) -> bool:
    return all(wp_config(site))


def set_wp(wid: str, url: str, user: str, password: str) -> dict:
    items = load()
    site = next(w for w in items if w["id"] == wid)
    wp = site.setdefault("wp", {})
    wp.setdefault("password_env", "WP_APP_PASSWORD_" + re.sub(r"[^A-Z0-9]+", "_", wid.upper()))
    wp.update(url=url.rstrip("/"), user=user)
    if not ENV_FILE.exists():
        ENV_FILE.write_text("")
    set_key(str(ENV_FILE), wp["password_env"], password, quote_mode="never")
    if not site.get("url"):
        site["url"] = wp["url"]
    site["updated"] = _now()
    save(items)
    return site


def public(site: dict) -> dict:
    """What the browser may see: everything except the password."""
    url, user, password = wp_config(site)
    out = {k: v for k, v in site.items() if k != "wp"}
    out["wp"] = {"url": url, "user": user, "has_password": bool(password)}
    out["connected"] = bool(url and user and password)
    return out


# ---------------------------------------------------------------- create / edit

def upsert(data: dict) -> dict:
    items = load()
    site = next((w for w in items if w["id"] == data.get("id")), None) if data.get("id") else None
    if site is None:
        if not (data.get("name") or "").strip():
            raise ValueError("Website name is required")
        base = _slug(data.get("name")); sid, n = base, 2
        while any(w["id"] == sid for w in items):
            sid, n = f"{base}-{n}", n + 1
        site = {"id": sid, "slug": sid, "created": _now(), "status": "active", "is_default": not items, "wp": {},
                "settings": {}, "source_ids": [], "relevance_threshold": DEFAULT_THRESHOLD, "template_id": ""}
        items.append(site)
    for k in TEXT_FIELDS:
        if k in data:
            site[k] = str(data[k] or "").strip()
    for k in LIST_FIELDS:
        if k in data:
            site[k] = _list(data[k])
    if "status" in data and data["status"] in ("active", "inactive"):
        site["status"] = data["status"]
    if "relevance_threshold" in data:
        site["relevance_threshold"] = max(0, min(100, int(data["relevance_threshold"] or 0)))
    if "template_id" in data:
        site["template_id"] = data["template_id"] or ""
    if "source_ids" in data:
        site["source_ids"] = None if data["source_ids"] is None else [str(s) for s in data["source_ids"]]
    if site.get("url"):
        site["url"] = site["url"].rstrip("/")
    site["updated"] = _now()
    save(items)
    return site


def set_source(wid: str, source_id: str, assigned: bool, all_ids: list[str]) -> dict:
    """Give a news source to a website or take it away. Every website keeps its own explicit list."""
    items = load()
    site = next(w for w in items if w["id"] == wid)
    ids = list(all_ids) if site.get("source_ids") is None else list(site["source_ids"])
    if assigned and source_id not in ids:
        ids.append(source_id)
    if not assigned and source_id in ids:
        ids.remove(source_id)
    site["source_ids"] = ids
    site["updated"] = _now()
    save(items)
    return site


HIDDEN_FILE = Path(__file__).parent / "ca_cache" / "hidden_news.json"
_hidden_lock = threading.Lock()


def _load_hidden(strict: bool = False) -> dict:
    if not HIDDEN_FILE.exists():
        return {}
    try:
        return json.loads(HIDDEN_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        if strict:   # never overwrite a list that could not be read
            raise
        return {}


def hidden_urls(wid: str = "") -> set[str]:
    """News deleted from Discover for this website, plus news deleted for every website ("")."""
    data = _load_hidden()
    return set(data.get("", {})) | (set(data.get(wid, {})) if wid else set())


def hide_news(wid: str, items: list[dict]) -> int:
    """Never list these news items again in Discover for a website ("" = every website), also after new scans."""
    with _hidden_lock:
        data = _load_hidden(strict=True)
        box = data.setdefault(wid or "", {})
        for i in items:
            if i.get("url"):
                box.setdefault(i["url"], {"title": (i.get("title") or "")[:200], "t": _now()})
        _write_json(HIDDEN_FILE, data)
        return len(box)


def owns(site: dict, source_id: str) -> bool:
    ids = site.get("source_ids")
    return ids is None or source_id in ids


def users_of(source_id: str) -> list[dict]:
    """The websites that use a news source."""
    return [w for w in load() if owns(w, source_id)]


def drop_source(source_id: str) -> None:
    """A deleted source disappears from every website."""
    items = load()
    for w in items:
        if w.get("source_ids") and source_id in w["source_ids"]:
            w["source_ids"].remove(source_id)
    save(items)


def fix_sources(all_ids: list[str]) -> None:
    """Migration from 'all sources' (None): the default (first) website keeps today's sources as an explicit list;
    another website starts with none and gets its own. A source added for one website never shows up in another."""
    items = load()
    if any(w.get("source_ids") is None for w in items):
        for w in items:
            if w.get("source_ids") is None:
                w["source_ids"] = list(all_ids) if w.get("is_default") else []
        save(items)


def save_settings(wid: str, changes: dict) -> dict:
    """Merge website-specific settings (only SITE_SECTIONS) into the website."""
    items = load()
    site = next(w for w in items if w["id"] == wid)
    cur = site.setdefault("settings", {})
    for sec, values in changes.items():
        if sec in SITE_SECTIONS and isinstance(values, dict):
            cur.setdefault(sec, {}).update(values)
    site["updated"] = _now()
    save(items)
    return site


def reset_settings(wid: str) -> None:
    items = load()
    site = next(w for w in items if w["id"] == wid)
    site["settings"] = {}
    save(items)


def remove(wid: str, article_count: int) -> None:
    """Delete a website that never got articles; one with articles can only be deactivated (nothing is lost)."""
    items = load()
    site = next(w for w in items if w["id"] == wid)
    if article_count:
        raise ValueError(f"{site['name']} has {article_count} articles — deactivate it instead of deleting it.")
    if len(items) == 1:
        raise ValueError("You need at least one website.")
    key = (site.get("wp") or {}).get("password_env")
    if key and key != "WP_APP_PASSWORD" and ENV_FILE.exists():
        unset_key(str(ENV_FILE), key)
    items = [w for w in items if w["id"] != wid]
    if site.get("is_default"):
        items[0]["is_default"] = True
    save(items)


# ---------------------------------------------------------------- niche relevance

def _stems(text: str) -> set[str]:
    out = set()
    for w in re.findall(r"[a-z0-9]+|[ऀ-ॿ]+", (text or "").lower()):
        out.add(w[:-1] if w.endswith("s") and len(w) > 3 else w)
    return out


def _hit(term: str, words: set[str]) -> bool:
    t = _stems(term)
    return bool(t) and t <= words


def relevance(item: dict, site: dict) -> int:
    """0-100: how well a discovered news title fits this website's niche.
    - a source not assigned to the website -> 0;  a blocked topic in the title -> 0
    - no topics/keywords configured -> 100 (the website takes everything from its sources, as before)
    - otherwise 70 + 15 per matching topic/keyword (max 100); no match -> 40"""
    ids = site.get("source_ids")
    if ids is not None and item.get("source_id") not in ids:
        return 0
    words = _stems(f"{item.get('title', '')} {item.get('category', '')}")
    if any(_hit(b, words) for b in site.get("blocked_topics") or []):
        return 0
    terms = (site.get("topics") or []) + (site.get("keywords") or [])
    if not terms:
        return 100
    hits = sum(1 for t in terms if _hit(t, words))
    return min(100, 70 + 15 * hits) if hits else 40


def threshold(site: dict) -> int:
    return int(site.get("relevance_threshold", DEFAULT_THRESHOLD))


def best_site(item: dict) -> dict | None:
    """The active website this news fits best (at or above its threshold); a website that deleted it is skipped."""
    urls = set(item.get("story_urls") or [item.get("url")])
    scored = sorted(((relevance(item, w), w) for w in active() if not urls & hidden_urls(w["id"])), key=lambda x: -x[0])
    return next((w for score, w in scored if score >= threshold(w)), None)


# ---------------------------------------------------------------- prompts

def profile_block(site: dict | None) -> str:
    """Website context added to Claude's system prompt (only when a niche profile has been filled in)."""
    if not site or not any(site.get(k) for k in ("topics", "keywords", "blocked_topics", "audience", "tone")):
        return ""
    lines = [f"- Website: {site.get('name', '')}" + (f" ({site['url']})" if site.get("url") else "")]
    if site.get("niche"):
        lines.append(f"- Niche: {site['niche']}")
    if site.get("topics") or site.get("keywords"):
        lines.append("- Focus topics: " + ", ".join((site.get("topics") or []) + (site.get("keywords") or [])))
    if site.get("blocked_topics"):
        lines.append("- Never write about: " + ", ".join(site["blocked_topics"]))
    if site.get("audience"):
        lines.append(f"- Readers: {site['audience']}")
    if site.get("tone"):
        lines.append(f"- Tone: {site['tone']}")
    if site.get("language"):
        lines.append(f"- Language of the article: {site['language']}")
    return "\n\n## Website\n" + "\n".join(lines) + "\n- Explain why the news matters for this website's readers."


def starter_system(site: dict) -> str:
    """System prompt for a new website's first Claude template (edit it under Claude Configuration)."""
    lang = site.get("language") or "English"
    return f"""You are an experienced writer for {site.get('name', 'this website')}{f" ({site['url']})" if site.get('url') else ''}.
Niche: {site.get('niche') or 'general news'}.
Readers: {site.get('audience') or 'people interested in ' + (site.get('niche') or 'this topic')}.
Write the whole article in {lang}.

## Using the source content
- Use only the facts (names, numbers, dates, places, schemes) from the given source content. Never invent facts.
- Write everything in your own words with a fresh structure; do not translate sentences one to one.
- If several sources are given, combine their facts into one complete article.

## Article
- A clear, specific title and an introduction that says what happened and why it matters to these readers.
- Use <h2>/<h3> headings, short paragraphs and lists where they help; return clean HTML in content_html.
- Tone: {site.get('tone') or 'clear, neutral and informative'}. Do not promote other websites.
- Stay within the niche; do not drift into unrelated topics.
"""


# ---------------------------------------------------------------- migration

def ensure_default(default_template_id: str = "", niche: str = "", language: str = "Marathi") -> dict:
    """First start with multi-website support: the existing WordPress connection (.env) becomes the default
    website and every existing article is assigned to it. Nothing is deleted or duplicated."""
    items = load()
    if items:
        site = default()
    else:
        env = dotenv_values(ENV_FILE) if ENV_FILE.exists() else {}
        url = (env.get("WP_URL") or "").strip().rstrip("/")
        host = re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
        name = host.split(".")[0].replace("-", " ").title() if host else "My Website"
        sid = _slug(host.split(".")[0]) if host else "main"
        site = {"id": sid, "slug": sid, "name": name, "url": url, "description": "", "logo": "",
                "niche": niche or (env.get("SITE_NICHE") or "").strip(), "language": language, "audience": "", "tone": "",
                "topics": [], "keywords": [], "blocked_topics": [], "status": "active", "is_default": True,
                "wp": {"url": url, "user": (env.get("WP_USER") or "").strip(), "password_env": "WP_APP_PASSWORD"},
                "settings": {}, "source_ids": None, "relevance_threshold": DEFAULT_THRESHOLD,
                "template_id": default_template_id, "created": _now(), "updated": _now()}
        save([site])
    # assign articles that have no website yet (only adds the field; "updated" and everything else stay as they are)
    for p in CA_DIR.glob("*/meta.json"):
        try:
            m = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not m.get("website_id"):
            m["website_id"] = site["id"]
            p.write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
    return site
