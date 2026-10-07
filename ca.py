"""
Current-affairs pipeline:  select -> extract -> queue -> (Claude writes) -> review -> WordPress.
Every article lives in ca_articles/<id>/meta.json. dashboard.py exposes these functions as JSON APIs.

Statuses
    selected   picked in Discover, nothing fetched yet
    extracted  source text + image fetched, waiting for Claude
    queued     waiting for a free writer          paused   taken out of the queue by the user
    writing    Claude Code is writing             error    something failed (see meta["error"])
    ready      written, waiting for review        changes  reviewer asked for modifications
    approved   reviewer approved                  rejected reviewer rejected
    draft      on WordPress as a draft            scheduled on WordPress with a future date
    published  live on WordPress
"""

import json
import logging
import mimetypes
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import requests
import trafilatura
from bs4 import BeautifulSoup

import activity
import app  # WordPress client, claude_json, site_catalog
import automation
import settings as cfg
import sources
import websites

BASE = Path(__file__).parent
CA_DIR = BASE / "ca_articles"
CACHE_DIR = BASE / "ca_cache"
TITLES_CACHE = CACHE_DIR / "titles.json"
META_CACHE = CACHE_DIR / "page_meta.json"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/129 Safari/537.36"}

WORKING = ("queued", "writing")
REVIEWABLE = ("ready", "changes", "approved", "rejected", "draft", "scheduled")
ON_WP = ("draft", "scheduled", "published")

ARTICLE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "content_html": {"type": "string", "description": "Full article as HTML, no <h1>"},
        "excerpt": {"type": "string", "description": "Meta description, 140-160 characters"},
        "focus_keyword": {"type": "string", "description": "Main keyword for Rank Math"},
        "tags": {"type": "array", "items": {"type": "string"}, "description": "3-6 tags"},
        "slug": {"type": "string", "description": "English, lowercase-hyphen"},
        "categories": {"type": "array", "items": {"type": "string"}, "description": "Only from the given list"},
    },
    "required": ["title", "content_html", "excerpt", "focus_keyword", "tags", "slug", "categories"],
    "additionalProperties": False,
}

BAD_IMAGES = ("emblem", "Akhashvani", "logo", "icon", "csattest", "1200x630wa", "encrypted-tbn")
ARTICLE_SELECTORS = {
    "pib.gov.in": "#PdfDiv", "civilsdaily.com": ".entry-content", "pwonlyias.com": "div.desc",
    "forumias.com": ".entry-content", "visionias.in": "#article-content", "dhyeyaias.com": "article",
}

_lock = threading.Lock()


# ---------------------------------------------------------------- storage

def _meta_path(aid: str) -> Path:
    return CA_DIR / aid / "meta.json"


def load(aid: str) -> dict:
    return json.loads(_meta_path(aid).read_text(encoding="utf-8"))


def save(meta: dict) -> None:
    path = _meta_path(meta["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    meta["updated"] = datetime.now().isoformat(timespec="seconds")
    with _lock:
        path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def all_articles() -> list[dict]:
    if not CA_DIR.exists():
        return []
    items = []
    for p in CA_DIR.glob("*/meta.json"):
        try:
            items.append(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return sorted(items, key=lambda m: m["created"], reverse=True)


def used_urls() -> dict[str, str]:
    """source url -> article id (so Discover can show what is already selected/written).
    The other sources an article was combined from count as used too."""
    return {url: u["id"] for url, u in used_by().items()}


def used_by(prefer: str = "") -> dict[str, dict]:
    """source url -> {id, website_id} of the article written from it (one source story -> one primary website).
    prefer: when several websites wrote the same story, that website's own article is the one returned."""
    used = {}
    for m in all_articles():
        ref = {"id": m["id"], "website_id": m.get("website_id") or ""}
        mine = bool(prefer) and ref["website_id"] == prefer
        for r in m.get("related", []):
            if r["url"] not in used or (mine and used[r["url"]]["website_id"] != prefer):
                used[r["url"]] = ref
        url = m["source"]["url"]
        if mine or not (url in used and prefer and used[url]["website_id"] == prefer):
            used[url] = ref
    return used


def log(meta: dict, msg: str, level: str = "info") -> None:
    meta.setdefault("log", []).append({"t": datetime.now().isoformat(timespec="seconds"), "msg": msg, "level": level})
    meta["log"] = meta["log"][-60:]


def set_status(aid: str, status: str, msg: str = "", level: str = "info", **extra) -> dict:
    meta = load(aid)
    meta["status"] = status
    meta.update(extra)
    if msg:
        log(meta, msg, level)
    save(meta)
    return meta


SOURCE_KEYS = ("title", "url", "source", "source_id", "date", "category", "excerpt")


def create_selection(item: dict, related: list[dict] | None = None, website_id: str = "") -> dict:
    """A title picked in Discover becomes an article with status 'selected', for one website.
    related: the same story on other sources; the article is written from all of them."""
    aid = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    meta = {"id": aid, "status": "selected", "created": datetime.now().isoformat(timespec="seconds"),
            "website_id": website_id or (websites.default() or {}).get("id", ""),
            "source": {k: item.get(k, "") for k in SOURCE_KEYS},
            "related": [{k: r.get(k, "") for k in SOURCE_KEYS} for r in related or []],
            "notes": "", "log": []}
    log(meta, "Article added to selection" + (f" (same news on {len(meta['related']) + 1} sources: "
                                              + ", ".join([item.get("source", "")] + [r.get("source", "") for r in related]) + ")" if related else ""))
    save(meta)
    return meta


def featured_image(aid: str) -> Path | None:
    for p in sorted((CA_DIR / aid).glob("featured.*")):
        return p
    return None


def set_featured_image(aid: str, data: bytes, filename: str) -> Path:
    ext = Path(filename).suffix.lower() or ".jpg"
    for old in (CA_DIR / aid).glob("featured.*"):
        old.unlink()
    path = CA_DIR / aid / f"featured{ext}"
    path.write_bytes(data)
    return path


def storage_bytes() -> int:
    return sum(p.stat().st_size for p in CA_DIR.rglob("*") if p.is_file()) if CA_DIR.exists() else 0


# ---------------------------------------------------------------- source pages

def fetch_source(url: str) -> dict:
    r = requests.get(url, headers=UA, timeout=60)
    r.raise_for_status()
    html = r.text
    soup = BeautifulSoup(html, "lxml")
    sel = next((v for k, v in ARTICLE_SELECTORS.items() if k in url), None)
    boxes = soup.select(sel) if sel else []
    box = max(boxes, key=lambda b: len(b.get_text())) if boxes else None
    if box:
        for junk in box.select(".content-box-red, .mobile_ad, .web_ad, .vc_button, script, style"):
            junk.decompose()
        text = box.get_text("\n", strip=True)
    else:
        text = trafilatura.extract(html, include_tables=True, favor_recall=True) or ""
    text = "\n".join(l for l in text.splitlines() if "click here" not in l.lower())
    for marker in ("Previous article", "\n****"):
        text = text.split(marker)[0]
    image = page_image(soup, url, box)
    og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
    if len(text) < 300:
        raise RuntimeError("The source page did not return enough text (it may be rendered by JavaScript or be premium content).")
    return {"text": text[:30000], "image": image,
            "description": (og_desc.get("content", "") if og_desc else "")[:300]}


def page_image(soup, url: str, box=None) -> str:
    og = soup.find("meta", property="og:image")
    image = og["content"].strip() if og and og.get("content") else ""
    if not image or any(b in image for b in BAD_IMAGES):
        img = next((i for i in (box or soup).find_all("img", src=True)
                    if any(k in i["src"] for k in ("/wp-content/uploads/", "WriteReadData", "/storage/"))
                    and not any(b in i["src"] for b in BAD_IMAGES)), None)
        image = requests.compat.urljoin(url, img["src"]) if img else ""
    return image


_meta_cache: dict = {}
_meta_lock = threading.Lock()


def page_meta(url: str) -> dict:
    """Cheap preview data for Discover (og:image + description), cached on disk."""
    with _meta_lock:
        if not _meta_cache and META_CACHE.exists():
            _meta_cache.update(json.loads(META_CACHE.read_text(encoding="utf-8")))
        if url in _meta_cache:
            return _meta_cache[url]
    data = {"image": "", "description": ""}
    try:
        r = requests.get(url, headers=UA, timeout=25)
        soup = BeautifulSoup(r.text, "lxml")
        og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
        data = {"image": page_image(soup, url), "description": (og_desc.get("content", "") if og_desc else "")[:300]}
    except requests.RequestException:
        pass
    with _meta_lock:
        _meta_cache[url] = data
        CACHE_DIR.mkdir(exist_ok=True)
        META_CACHE.write_text(json.dumps(_meta_cache, ensure_ascii=False), encoding="utf-8")
    return data


def download_image(aid: str, url: str) -> bool:
    try:
        r = requests.get(url, headers=UA, timeout=60)
        r.raise_for_status()
        ctype = r.headers.get("content-type", "").split(";")[0]
        if not ctype.startswith("image/"):
            return False
        set_featured_image(aid, r.content, f"x{mimetypes.guess_extension(ctype) or '.jpg'}")
        return True
    except requests.RequestException:
        return False


# ---------------------------------------------------------------- pipeline steps

RELATED_CHARS = 12000   # per extra source, keeps the combined prompt a sensible size


def _fetch_related(meta: dict) -> list[dict]:
    """Read the other sources of a combined story in parallel; a page that cannot be read gets an 'error'."""
    def one(r):
        try:
            src = fetch_source(r["url"])
            return {**r, "text": src["text"][:RELATED_CHARS], "full": src["text"], "image": src["image"]}
        except Exception as e:
            return {**r, "error": str(e)[:200]}
    rel = meta.get("related") or []
    if not rel:
        return []
    with ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(one, rel))


def extract(aid: str) -> dict:
    """Fetch the source article text and image (and those of the same story on other sources). selected -> extracted."""
    meta = load(aid)
    meta.update(step="fetching")
    log(meta, "Fetching source content" + (f" from {len(meta['related']) + 1} sources" if meta.get("related") else ""))
    save(meta)
    try:
        try:
            src, main_error = fetch_source(meta["source"]["url"]), None
        except Exception as e:
            src, main_error = None, e
        others = _fetch_related(meta)
        meta = load(aid)
        if src is None:
            ok = next((o for o in others if o.get("text")), None)
            if not ok:
                raise main_error
            # the lead page could not be read: another source of the same story takes its place
            log(meta, f"{meta['source']['source']} could not be read ({str(main_error)[:120]}); using {ok['source']} as the main source")
            meta["related"] = [meta["source"]] + [r for r in meta["related"] if r["url"] != ok["url"]]
            meta["source"] = {k: ok.get(k, "") for k in SOURCE_KEYS}
            src = {"text": ok["full"], "image": ok["image"]}
            others = [o for o in others if o["url"] != ok["url"]]
        read = [o for o in others if o.get("text")]
        meta.update(source_text=src["text"], source_image=src["image"] or next((o["image"] for o in read if o.get("image")), ""), step="",
                    related_texts=[{k: o[k] for k in ("source", "title", "url", "text")} for o in read])
        if meta["source_image"] and not featured_image(aid) and cfg.load_settings(websites.site_of(meta))["publish"].get("image_source", "source") == "source":
            meta["image_downloaded"] = download_image(aid, meta["source_image"])
        if meta["status"] == "selected":
            meta["status"] = "extracted"
        log(meta, f"Source content extracted ({len(src['text'].split())} words)"
                  + (f" + {len(read)} more source{'s' if len(read) > 1 else ''} ({sum(len(o['text'].split()) for o in read)} words)" if read else ""), "ok")
        for o in others:
            if o.get("error"):
                log(meta, f"Skipped {o['source']}: {o['error']}")
        save(meta)
        return meta
    except Exception as e:
        meta = load(aid)
        meta.update(status="error", step="", error=str(e)[:600])
        log(meta, f"Extraction failed: {e}", "err")
        save(meta)
        raise


_catalog_cache: dict = {}   # website id -> {at, cats, posts}


def _catalog(site: dict | None = None) -> tuple[list[str], list[tuple[str, str]]]:
    """Categories and recent posts of one website's WordPress (each website has its own)."""
    site = site or websites.default()
    url = websites.wp_config(site)[0]
    key = (site or {}).get("id", "")
    hit = _catalog_cache.get(key)
    if not hit or time.time() - hit["at"] > 3600:
        cats, posts = app.site_catalog(url) if url else ([], [])
        hit = _catalog_cache[key] = {"at": time.time(), "cats": cats, "posts": posts}
    return hit["cats"], hit["posts"]


QUICK_RULES = {
    "faq": "Include a 'नेहमी विचारले जाणारे प्रश्न (FAQ)' section with 2-3 questions.",
    "mcq": "Include a 'संभाव्य प्रश्न (MCQ)' section with 3-5 multiple-choice questions, answers and one-line explanations.",
    "highlights": "Include a 'परीक्षेच्या दृष्टीने महत्त्वाचे' table of one-liner facts.",
    "meta_description": "Write the excerpt as a meta description of 140-160 characters containing the focus keyword.",
    "internal_links": "From the list of the site's older posts, add 1-3 relevant internal links naturally (<a href=\"URL\">). Never invent URLs.",
}


LENGTHS = {"short": "500-800", "medium": "800-1200", "long": "1500-2000"}


def build_prompt(meta: dict, template: dict | None = None) -> tuple[str, str, dict]:
    """System prompt, user prompt and JSON schema for one article — with the settings, template, categories and
    niche of the website the article belongs to."""
    site = websites.site_of(meta)
    s = cfg.load_settings(site)
    template = template or cfg.get_template(meta.get("template_id"), site)
    cats, posts = _catalog(site)
    schema = json.loads(json.dumps(ARTICLE_SCHEMA))
    if cats:
        schema["properties"]["categories"]["items"]["enum"] = cats
    rules = [QUICK_RULES[k] for k, on in s["quick"].items() if on and k in QUICK_RULES and not (k == "internal_links" and not s["seo"].get("internal_links", True))]
    con, seo = s.get("content", {}), s.get("seo", {})
    rules.append(f"Target length: {LENGTHS.get(con.get('length', 'medium'), '800-1200')} words.")
    if seo.get("internal_links", True):
        rules.append(f"Use at most {seo.get('max_internal_links', 3)} internal links.")
    rules.append(f"Keep the slug under {seo.get('slug_max', 70)} characters.")
    related = meta.get("related_texts") or []
    if con.get("source_link"):
        rules.append("End the article with a short 'स्रोत' line linking to the original URL"
                     + ("s (one link per source)." if related else "."))
    if con.get("disclaimer"):
        rules.append("Append this disclaimer paragraph at the very end: " + con["disclaimer"])
    if con.get("language_note"):
        rules.append(con["language_note"])
    system = template["system"] + websites.profile_block(site) + ("\n\n## Output rules\n" + "\n".join(f"- {r}" for r in rules) if rules else "")
    src = meta["source"]
    content, source_names = meta.get("source_text", ""), src["source"]
    if related:
        # the same story from several websites: give Claude every version, clearly separated
        parts = [(src["source"], src["title"], src["url"], content)] + [(r["source"], r["title"], r["url"], r["text"]) for r in related]
        content = "\n\n".join(f"===== Source {i} of {len(parts)}: {name} =====\nTitle: {title}\nURL: {url}\n\n{text}"
                              for i, (name, title, url, text) in enumerate(parts, 1))
        source_names = ", ".join(p[0] for p in parts)
    user = cfg.render_user_prompt(template["user"], title=src["title"], source=source_names,
                                  category=src.get("category", ""), date=src.get("date", ""), url=src["url"],
                                  extracted_content=content)
    if related:
        user += (f"\n\nThe same news was reported by {len(related) + 1} different websites (all given above). "
                 "Write ONE complete article that combines the facts from every source, so nothing important that any "
                 "source mentions is missing. Do not repeat the same point twice. If the sources disagree on a number, "
                 "date or name, use the official government source (PIB) when present, otherwise the most specific "
                 "source, and never invent facts. If one source turns out to be about a different event, ignore it.")
    context = "Website categories (choose only from these):\n" + "\n".join(f"- {c}" for c in cats)
    if s["quick"].get("internal_links"):
        context += "\n\nSite's older posts (for internal links):\n" + "\n".join(f"- {t} | {u}" for t, u in posts[:150])
    return system, context + "\n\n---\n\n" + user, schema


def write_article(meta: dict, template: dict | None = None) -> dict:
    system, prompt, schema = build_prompt(meta, template)
    site = websites.site_of(meta)
    s = cfg.load_settings(site)
    template = template or cfg.get_template(meta.get("template_id"), site)
    model = template.get("model") or s.get("model") or ""
    data = app.claude_json(system, prompt, schema, model=model)
    seo = s.get("seo", {})
    slug = re.sub(r"[^a-z0-9-]+", "-", data["slug"].lower()).strip("-")[:int(seo.get("slug_max") or 70)].strip("-") or meta["id"]
    data["slug"] = slug + (seo.get("slug_suffix") or "")
    extra = [k.strip() for k in (seo.get("default_keywords") or "").split(",") if k.strip()]
    data["tags"] = list(dict.fromkeys(list(data["tags"]) + extra))
    return data


def generate(aid: str) -> None:
    """Full write for one queued article (runs in a worker thread)."""
    started = time.time()
    meta = load(aid)
    meta.update(status="writing", step="fetching", error="", started=datetime.now().isoformat(timespec="seconds"))
    log(meta, "Processing started")
    save(meta)
    try:
        if not load(aid).get("source_text"):
            extract(aid)
        meta = set_status(aid, "writing", "Sending to Claude AI", step="writing")
        data = write_article(meta)
        meta = load(aid)
        meta.update(article=data, status="ready", step="", seconds=int(time.time() - started),
                    finished=datetime.now().isoformat(timespec="seconds"))
        log(meta, f"Claude finished the article ({len(data['content_html'].split())} words)", "ok")
        save(meta)
        activity.log("Article generated", "AI Processing", data["title"], user="System", article_id=aid)
        automation.fire("article_ready", event_payload(meta))
        site = websites.site_of(meta)
        if wp_ready(site) and cfg.load_settings(site)["publish"].get("auto_draft", True):
            set_status(aid, "ready", "Sending draft to WordPress", step="uploading")
            try:
                save_to_wp(aid, "draft")
            except Exception as e:  # draft upload failing should not lose the article
                set_status(aid, "ready", f"Draft upload failed: {e}", "err", step="")
    except Exception as e:
        meta = load(aid)
        meta.update(status="error", step="", error=str(e)[:800])
        log(meta, f"Failed: {e}", "err")
        save(meta)
        activity.log("Processing failed", "AI Processing", f"{meta['source']['title']}: {e}", "failed", user="System", article_id=aid)
        automation.fire("processing_failed", event_payload(meta))


def event_payload(meta: dict) -> dict:
    a = meta.get("article") or {}
    src = meta["source"]
    return {"id": meta["id"], "website_id": meta.get("website_id") or (websites.default() or {}).get("id"),
            "title": a.get("title") or src["title"], "source": src.get("source"), "source_id": src.get("source_id"),
            "category": src.get("category"), "excerpt": a.get("excerpt", src.get("excerpt", "")), "status": meta["status"],
            "seo": seo_score(meta)["score"] if a else 0}


def _site_name(site: dict | None) -> str:
    """{site_name} in SEO templates: the website's domain, as before there were several websites."""
    site = site or websites.default() or {}
    url = websites.wp_config(site)[0] or site.get("url") or ""
    return url.replace("https://", "").replace("http://", "").rstrip("/") or site.get("name", "")


def seo_title(a: dict, source: str = "", site: dict | None = None) -> str:
    """SEO title from the website's own template (one website's template is never used for another)."""
    seo = cfg.load_settings(site or websites.default())["seo"]
    if not seo.get("auto_title", True):
        return ""
    t = cfg.render_user_prompt(seo.get("title_template") or "{title}", title=a["title"], source_name=source,
                               year=datetime.now().year, site_name=_site_name(site),
                               focus_keyword=a.get("focus_keyword", ""))
    if seo.get("add_source_name") and source and source not in t:
        t += f" | {source}"
    if seo.get("add_year") and str(datetime.now().year) not in t:
        t += f" {datetime.now().year}"
    return t.strip()


def seo_description(a: dict, site: dict | None = None) -> str:
    seo = cfg.load_settings(site or websites.default())["seo"]
    if not seo.get("auto_description", True):
        return ""
    return cfg.render_user_prompt(seo.get("description_template") or "{excerpt}", excerpt=a["excerpt"], title=a["title"],
                                  site_name=_site_name(site),
                                  focus_keyword=a.get("focus_keyword", "")).strip()


# ---------------------------------------------------------------- SEO score

def seo_score(meta: dict) -> dict:
    a = meta.get("article")
    if not a:
        return {"score": 0, "checks": []}
    text = re.sub(r"<[^>]+>", " ", a["content_html"])
    words = text.split()
    n = max(len(words), 1)
    kw = (a.get("focus_keyword") or "").strip()
    kw_l = kw.lower()
    first_par = re.search(r"<p[^>]*>(.*?)</p>", a["content_html"], re.S | re.I)
    first = re.sub(r"<[^>]+>", " ", first_par.group(1)).lower() if first_par else text[:400].lower()
    density = (text.lower().count(kw_l) * max(len(kw.split()), 1) / n * 100) if kw else 0
    h2 = len(re.findall(r"<h2", a["content_html"], re.I))
    h3 = len(re.findall(r"<h3", a["content_html"], re.I))
    tl, dl = len(a["title"]), len(a.get("excerpt", ""))
    checks = [
        ("Focus keyword in title", bool(kw) and kw_l in a["title"].lower(), 15),
        ("Keyword in first paragraph", bool(kw) and kw_l in first, 10),
        ("Meta description 120–160 characters", 120 <= dl <= 160, 15),
        ("Keyword in meta description", bool(kw) and kw_l in a.get("excerpt", "").lower(), 5),
        ("Title length 40–70 characters", 40 <= tl <= 70, 10),
        ("At least 3 H2 headings", h2 >= 3, 10),
        ("Uses H3 sub-headings", h3 >= 1, 5),
        ("600+ words", n >= 600, 10),
        (f"Keyword density {density:.1f}% (0.5–2.5% is good)", 0.5 <= density <= 2.5, 10),
        ("Has an internal link", "<a " in a["content_html"], 5),
        ("Has a featured image", bool(featured_image(meta["id"])), 5),
    ]
    score = sum(w for _, ok, w in checks if ok)
    return {"score": score, "words": n, "reading_min": max(1, round(n / 200)),
            "checks": [{"label": l, "ok": ok, "weight": w} for l, ok, w in checks]}


# ---------------------------------------------------------------- WordPress

def wp_ready(site: dict | None = None) -> bool:
    return websites.connected(site or websites.default())


def wp_client(site: dict | None) -> "app.WordPress":
    """A WordPress client with this website's own credentials — never another website's."""
    url, user, password = websites.wp_config(site)
    if not (url and user and password):
        raise RuntimeError(f"{(site or {}).get('name', 'This website')} is not connected to WordPress")
    return app.WordPress(url, user, password)


def _post_payload(wp: "app.WordPress", meta: dict, pub: dict, site: dict | None = None) -> dict:
    a = meta["article"]
    cats = list(a["categories"])
    if pub.get("default_category") and pub["default_category"] not in cats:
        cats.append(pub["default_category"])
    tags = list(a["tags"]) + [t.strip() for t in (pub.get("default_tags") or "").split(",") if t.strip()]
    payload = {
        "title": a["title"], "content": a["content_html"], "excerpt": a["excerpt"], "slug": a["slug"],
        "tags": [wp.term_id("tags", t) for t in dict.fromkeys(tags)],
        "categories": [wp.term_id("categories", c) for c in dict.fromkeys(cats)],
    }
    if pub.get("author"):
        payload["author"] = pub["author"]
    if pub.get("featured_image", True):
        img = featured_image(meta["id"])
        if img and meta.get("wp_image_file") != img.name:
            alt = cfg.render_user_prompt(cfg.load_settings(site)["seo"].get("alt_template") or "{title}", title=a["title"],
                                         focus_keyword=a.get("focus_keyword", ""))
            media = wp.upload_image(img, alt)
            meta["wp_media_id"], meta["wp_image_file"] = media["id"], img.name
        if meta.get("wp_media_id"):
            payload["featured_media"] = meta["wp_media_id"]
    return payload


def _rankmath(wp: "app.WordPress", post_id: int, a: dict, source: str = "", site: dict | None = None) -> bool:
    """Set Rank Math focus keyword / title / description. Returns False if the plugin API is unavailable."""
    meta = {"rank_math_focus_keyword": a["focus_keyword"]}
    if seo_title(a, source, site):
        meta["rank_math_title"] = seo_title(a, source, site)
    if seo_description(a, site):
        meta["rank_math_description"] = seo_description(a, site)
    r = wp.session.post(f"{wp.url}/wp-json/rankmath/v1/updateMeta", timeout=30,
                        json={"objectID": post_id, "objectType": "post", "meta": meta})
    return r.ok


def save_to_wp(aid: str, status: str, when: str | None = None) -> dict:
    """Create or update the WordPress post. status: draft | publish | future (with `when` ISO datetime)."""
    meta = load(aid)
    site = websites.site_of(meta)   # the article's own website decides where it goes
    pub = cfg.load_settings(site)["publish"]
    wp = wp_client(site)
    payload = _post_payload(wp, meta, pub, site)
    payload["status"] = status
    if status == "future" and when:
        payload["date"] = when
    if meta.get("wp_id"):
        r = wp.session.post(f"{wp.api}/posts/{meta['wp_id']}", json=payload, timeout=60)
        r.raise_for_status()
        post = r.json()
    else:
        post = wp.create_post(payload)
    new_status = {"publish": "published", "future": "scheduled", "draft": "draft"}[status]
    meta.update(wp_id=post["id"], url=post["link"], step="", status=new_status, error="", publish_error="")
    if status == "publish":
        meta["published_at"] = datetime.now().isoformat(timespec="seconds")
    if status == "future":
        meta["scheduled_for"] = when
    log(meta, {"publish": "Published on WordPress", "future": f"Scheduled on WordPress for {when}",
               "draft": "Saved on WordPress as draft"}[status], "ok")
    if pub.get("rankmath_meta", True):
        try:
            ok = _rankmath(wp, post["id"], meta["article"], meta["source"].get("source", ""), site)
            log(meta, "Rank Math SEO meta updated" if ok else "Rank Math API not available – set the focus keyword in WordPress", "ok" if ok else "err")
        except requests.RequestException as e:
            log(meta, f"Rank Math update failed: {e}", "err")
    save(meta)
    activity.log({"publish": "Published article", "future": "Scheduled article", "draft": "Saved WordPress draft"}[status],
                 "WordPress", meta["article"]["title"], article_id=aid)
    if status == "publish":
        automation.fire("article_published", event_payload(meta))
    return meta


def wp_info(site: dict | None = None) -> dict:
    """Connection card data of one website: site name, counts, WordPress version (best effort)."""
    site = site or websites.default()
    if not wp_ready(site):
        return {"connected": False}
    wp = wp_client(site)
    out = {"connected": True, "url": wp.url}
    try:
        root = wp.session.get(f"{wp.url}/wp-json/", timeout=30).json()
        out["name"] = root.get("name", "")
        out["rankmath"] = any(ns.startswith("rankmath") for ns in root.get("namespaces", []))
    except Exception:
        pass

    def total(**params):
        r = wp.session.get(f"{wp.api}/posts", params={"per_page": 1, "_fields": "id", **params}, timeout=30)
        r.raise_for_status()
        return int(r.headers.get("X-WP-Total", 0))
    try:
        today = datetime.now().date().isoformat()
        out.update(total=total(status="publish"), drafts=total(status="draft"), scheduled=total(status="future"),
                   today=total(status="publish", after=f"{today}T00:00:00"))
        me = wp.session.get(f"{wp.api}/users/me", params={"context": "edit"}, timeout=30).json()
        out["user"] = {"id": me.get("id"), "name": me.get("name")}
    except Exception as e:
        out["error"] = str(e)[:200]
    try:
        home = requests.get(wp.url, headers=UA, timeout=20).text
        m = re.search(r'name="generator" content="WordPress ([\d.]+)', home)
        out["version"] = m.group(1) if m else ""
    except requests.RequestException:
        out["version"] = ""
    return out


def wp_lists(site: dict | None = None) -> dict:
    """Authors + categories of one website, for its default-settings form."""
    site = site or websites.default()
    if not wp_ready(site):
        return {"authors": [], "categories": []}
    wp = wp_client(site)
    try:
        users = wp.session.get(f"{wp.api}/users", params={"per_page": 100, "context": "edit", "_fields": "id,name"}, timeout=30).json()
    except Exception:
        users = []
    cats, _ = _catalog(site)
    return {"authors": [{"id": u["id"], "name": u["name"]} for u in users if isinstance(u, dict)], "categories": cats}


# ---------------------------------------------------------------- worker

class Worker:
    """Writes queued articles in the background; parallelism follows settings['writers']."""

    def __init__(self):
        self.queue: list[str] = []
        self.active = 0
        self.cv = threading.Condition()
        for m in all_articles():  # articles interrupted by a restart go back to the queue
            if m["status"] in WORKING:
                set_status(m["id"], "queued", "Re-queued after restart", step="")
                self.queue.append(m["id"])
        for _ in range(4):
            threading.Thread(target=self._run, daemon=True).start()

    def add(self, aid: str) -> None:
        with self.cv:
            if aid not in self.queue:
                self.queue.append(aid)
            self.cv.notify_all()

    def remove(self, aid: str) -> None:
        with self.cv:
            if aid in self.queue:
                self.queue.remove(aid)

    @staticmethod
    def _writers() -> int:
        try:
            return max(1, int(cfg.load_settings().get("writers", 2)))
        except (TypeError, ValueError):  # a bad setting must not stop the writer threads
            return 2

    def _run(self) -> None:
        while True:
            with self.cv:
                while not self.queue or self.active >= self._writers():
                    self.cv.wait(timeout=2)
                aid = self.queue.pop(0)
                self.active += 1
            try:
                if load(aid)["status"] == "queued":
                    generate(aid)
            except Exception:  # keep the thread alive; generate() records its own errors on the article
                logging.getLogger(__name__).exception("Writer failed on %s", aid)
            finally:
                with self.cv:
                    self.active -= 1
                    self.cv.notify_all()


# ---------------------------------------------------------------- titles

def load_titles() -> dict:
    if TITLES_CACHE.exists():
        return json.loads(TITLES_CACHE.read_text(encoding="utf-8"))
    return {"fetched_at": None, "items": [], "errors": {}, "stats": {}}


def _save_titles(data: dict) -> dict:
    CACHE_DIR.mkdir(exist_ok=True)
    TITLES_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


def _mark_seen(items: list[dict], before: list[dict]) -> None:
    """When a scan first found each news item (Discover lists the newest first)."""
    seen, now = {i["url"]: i.get("seen") for i in before}, datetime.now().isoformat(timespec="seconds")
    for i in items:
        i["seen"] = seen.get(i["url"]) or now


def refresh_titles(only: list[dict] | None = None) -> dict:
    """Scan every enabled source, or only the given ones (one website's): the other sources' news is kept."""
    if only is None:
        items, errors, stats = sources.fetch_all()
        _mark_seen(items, load_titles()["items"])
        old = load_titles().get("stats", {})
        old.update(stats)
        return _save_titles({"fetched_at": datetime.now().isoformat(timespec="seconds"), "items": items,
                             "errors": errors, "stats": old})
    items, errors, stats = sources.fetch_all(only)
    data = load_titles()
    _mark_seen(items, data["items"])
    ids, names = {s["id"] for s in only}, {s["name"] for s in only}
    data["items"] = [i for i in data["items"] if i.get("source_id") not in ids] + items
    data["items"].sort(key=lambda i: i.get("date", ""), reverse=True)
    data["errors"] = {k: v for k, v in (data.get("errors") or {}).items() if k not in names} | errors
    data.setdefault("stats", {}).update(stats)
    data["fetched_at"] = data.get("fetched_at") or datetime.now().isoformat(timespec="seconds")
    return _save_titles(data)


def refresh_one_source(src: dict) -> dict:
    data = load_titles()
    stats = data.setdefault("stats", {})
    try:
        found = sources.fetch_source(src)
        _mark_seen(found, data["items"])
        stats[src["id"]] = {"count": len(found), "error": "", "checked": datetime.now().isoformat(timespec="seconds")}
        data["errors"].pop(src["name"], None)
    except Exception as e:
        found = [i for i in data["items"] if i.get("source_id") == src["id"]]
        stats[src["id"]] = {"count": len(found), "error": str(e)[:200], "checked": datetime.now().isoformat(timespec="seconds")}
        data["errors"][src["name"]] = str(e)[:200]
    data["items"] = [i for i in data["items"] if i.get("source_id") != src["id"]] + found
    data["items"].sort(key=lambda i: i.get("date", ""), reverse=True)
    data["fetched_at"] = data["fetched_at"] or datetime.now().isoformat(timespec="seconds")
    return _save_titles(data)
