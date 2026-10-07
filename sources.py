"""
Current-affairs sources. The list lives in sources.json and is managed from the dashboard
(add / remove / enable / disable). Every source returns items: {"title", "url", "date"}.

Kinds:
    rss        {"url", "skip"}                          any RSS / Atom feed
    wordpress  {"base", "post_type", "params", "skip"}  WordPress REST API (/wp-json/wp/v2/...)
    html       {"url", "prefix"}                        plain listing page: links starting with prefix
    pib        {"reg", "lang"}                          PIB "All releases" page
    visionias  {}                                       Vision IAS "News Today"
    dhyeyaias  {}                                       Dhyeya IAS daily current affairs
"""

import html
import json
import re
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

SOURCES_FILE = Path(__file__).parent / "sources.json"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/129 Safari/537.36"}

CATEGORIES = ["National", "State", "Economy", "Finance", "Science", "Education", "Governance", "Policy",
              "International", "Environment", "Defence", "General"]

DEFAULT_SOURCES = [
    {"name": "PIB (English)", "kind": "pib", "config": {"reg": 3, "lang": 1}, "official": True,
     "category": "National", "site": "https://www.pib.gov.in", "description": "Press Information Bureau – Government of India press releases"},
    {"name": "PIB (मराठी)", "kind": "pib", "config": {"reg": 1, "lang": 9}, "official": True,
     "category": "State", "site": "https://www.pib.gov.in", "description": "PIB Mumbai – Marathi press releases"},
    {"name": "AIR News", "kind": "wordpress", "official": True, "category": "National", "site": "https://newsonair.gov.in",
     "description": "All India Radio news (national, international, business)",
     "config": {"base": "https://newsonair.gov.in", "params": {"lang": "en", "categories": "41706,33,39"}}},
    {"name": "NextIAS", "kind": "wordpress", "category": "General", "site": "https://www.nextias.com/ca",
     "config": {"base": "https://www.nextias.com/ca", "skip": ["news in short"]}},
    {"name": "CrackitToday", "kind": "wordpress", "category": "General", "site": "https://crackittoday.com",
     "config": {"base": "https://crackittoday.com", "params": {"categories": "4"}}},
    {"name": "ForumIAS", "kind": "wordpress", "category": "General", "site": "https://forumias.com/blog",
     "config": {"base": "https://forumias.com/blog", "params": {"categories": "1566,1230"}}},
    {"name": "CivilsDaily", "kind": "wordpress", "category": "General", "site": "https://www.civilsdaily.com",
     "config": {"base": "https://www.civilsdaily.com", "post_type": "news", "params": {"per_page": 30}}},
    {"name": "PW OnlyIAS", "kind": "wordpress", "category": "General", "site": "https://pwonlyias.com",
     "config": {"base": "https://pwonlyias.com", "post_type": "current-affairs", "params": {"per_page": 20}}},
    {"name": "Vision IAS", "kind": "visionias", "config": {}, "category": "General", "site": "https://visionias.in"},
    {"name": "Dhyeya IAS", "kind": "dhyeyaias", "config": {}, "category": "General", "site": "https://www.dhyeyaias.com"},
]
EDITABLE = ("enabled", "name", "category", "description", "frequency", "section", "site")


# ---------------------------------------------------------------- storage

def load_sources() -> list[dict]:
    if not SOURCES_FILE.exists():
        save_sources([{"id": uuid.uuid4().hex[:8], "enabled": True, "official": False, **s}
                      for s in DEFAULT_SOURCES])
    items = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    defaults = {d["name"]: d for d in DEFAULT_SOURCES}
    for s in items:  # fill fields added after the file was first written
        d = defaults.get(s["name"], {})
        s.setdefault("category", d.get("category", "General"))
        s.setdefault("description", d.get("description", ""))
        s.setdefault("site", d.get("site") or s["config"].get("base") or s["config"].get("url", ""))
        s.setdefault("frequency", "manual")
        s.setdefault("section", "")
    return items


def save_sources(items: list[dict]) -> None:
    SOURCES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def add_source(name: str, kind: str, config: dict, **fields) -> dict:
    items = load_sources()
    src = {"id": uuid.uuid4().hex[:8], "name": name.strip(), "kind": kind, "config": config,
           "enabled": True, "official": False, "category": "General", "description": "",
           "frequency": "manual", "section": "",
           "site": config.get("base") or config.get("url", "")}
    src.update({k: v for k, v in fields.items() if k in EDITABLE})
    items.append(src)
    save_sources(items)
    return src


def update_source(sid: str, **changes) -> dict:
    items = load_sources()
    for s in items:
        if s["id"] == sid:
            if changes.get("kind") and changes.get("config") is not None:  # re-detected URL
                s["kind"], s["config"] = changes["kind"], changes["config"]
            s.update({k: v for k, v in changes.items() if k in EDITABLE})
            save_sources(items)
            return s
    raise KeyError(sid)


def remove_source(sid: str) -> None:
    save_sources([s for s in load_sources() if s["id"] != sid])


# ---------------------------------------------------------------- fetchers

def _get(url: str, timeout: int = 40) -> requests.Response:
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r


def _date(text: str) -> str:
    try:
        return parsedate_to_datetime(text).date().isoformat()
    except (TypeError, ValueError):
        return text[:10] if re.match(r"\d{4}-\d{2}-\d{2}", text or "") else ""


def _time(text: str) -> str:
    """Publish date and time (local, ISO) from an RSS / Atom date, or "" when the feed has none."""
    text = (text or "").strip()
    try:
        dt = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return ""
    if dt.tzinfo:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt.isoformat(timespec="seconds")


def _skip(title: str, skip) -> bool:
    return any(s.lower() in title.lower() for s in (skip or []))


def fetch_rss(url: str, skip=None, **_) -> list[dict]:
    soup = BeautifulSoup(_get(url).content.strip(), "xml")
    items = []
    for it in soup.find_all(["item", "entry"]):
        title = " ".join(it.title.get_text().split()) if it.title else ""
        link = it.find("link")
        href = (link.get("href") or link.get_text()).strip() if link else ""
        when = it.find(["pubDate", "published", "updated"])
        desc = it.find(["description", "summary"])
        if title and href and not _skip(title, skip):
            excerpt = " ".join(re.sub(r"<[^>]+>", " ", html.unescape(desc.get_text())).split())[:220] if desc else ""
            items.append({"title": html.unescape(title), "url": href, "excerpt": excerpt,
                          "date": _date(when.get_text()) if when else "", "time": _time(when.get_text()) if when else ""})
    return items


def fetch_wordpress(base: str, post_type: str = "posts", params: dict | None = None, skip=None, **_) -> list[dict]:
    p = {"per_page": 50, "_fields": "date,link,title,excerpt", **(params or {})}
    r = requests.get(f"{base.rstrip('/')}/wp-json/wp/v2/{post_type}", params=p, headers=UA, timeout=60)
    r.raise_for_status()
    items = []
    for x in r.json():
        title = " ".join(html.unescape(x["title"]["rendered"]).split())
        if title and not _skip(title, skip):
            raw = (x.get("excerpt") or {}).get("rendered", "")
            excerpt = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw)).split())[:220]
            items.append({"title": title, "url": x["link"], "date": x["date"][:10], "time": x["date"][:19], "excerpt": excerpt})
    return items


def fetch_html(url: str, prefix: str, **_) -> list[dict]:
    r = _get(url, 60)
    seen = {}
    for a in BeautifulSoup(r.text, "lxml").find_all("a", href=True):
        href = urljoin(r.url, a["href"]).split("#")[0]
        title = " ".join(a.get_text(" ", strip=True).split())
        if href.startswith(prefix) and href.rstrip("/") != prefix.rstrip("/") and len(title) >= 20:
            seen.setdefault(href, title)
    return [{"title": t, "url": u, "date": ""} for u, t in seen.items()]


def fetch_pib(reg: int, lang: int, **_) -> list[dict]:
    soup = BeautifulSoup(_get(f"https://www.pib.gov.in/allRel.aspx?reg={reg}&lang={lang}", 60).text, "lxml")
    today, items = date.today().isoformat(), []
    for a in soup.select('div.content-area ul.num li a[href*="PRID="]'):
        prid = re.search(r"PRID=(\d+)", a["href"])
        if prid and a.get_text(strip=True):
            items.append({"title": a.get_text(" ", strip=True), "date": today,
                          "url": f"https://www.pib.gov.in/PressReleasePage.aspx?PRID={prid.group(1)}"})
    return items


def fetch_visionias(**_) -> list[dict]:
    r = _get("https://visionias.in/current-affairs/news-today", 60)
    m = re.search(r"/news-today/(\d{4}-\d{2}-\d{2})/", r.url)
    if not m:
        return []
    day, seen = m.group(1), {}
    for a in BeautifulSoup(r.text, "lxml").select(f'a[href*="/news-today/{day}/"]'):
        title = re.sub(r"^\d+\s*", "", a.get_text(" ", strip=True))
        if title:
            seen.setdefault(urljoin(r.url, a["href"]), title)
    return [{"title": t, "url": u, "date": day} for u, t in seen.items()]


def fetch_dhyeyaias(**_) -> list[dict]:
    soup = BeautifulSoup(_get("https://www.dhyeyaias.com/current-affairs/daily-current-affairs", 60).text, "lxml")
    items = []
    for c in soup.select("div.card.my-4"):
        t, a, d = c.select_one("h4.card-title"), c.select_one("a.btn-ex-blue"), c.select_one("small.text-muted")
        if t and a:
            try:
                day = datetime.strptime(d.get_text(strip=True), "%d %b %Y").date().isoformat() if d else ""
            except ValueError:
                day = ""
            items.append({"title": t.get_text(strip=True), "url": a["href"], "date": day})
    return items


FETCHERS = {"rss": fetch_rss, "wordpress": fetch_wordpress, "html": fetch_html, "pib": fetch_pib,
            "visionias": fetch_visionias, "dhyeyaias": fetch_dhyeyaias}
KIND_LABELS = {"rss": "RSS feed", "wordpress": "WordPress API", "html": "Web page", "pib": "PIB",
               "visionias": "Custom", "dhyeyaias": "Custom"}


def fetch_source(src: dict) -> list[dict]:
    seen, out = set(), []
    for it in FETCHERS[src["kind"]](**src["config"]):
        if it["url"] not in seen:
            seen.add(it["url"])
            out.append(it | {"source": src["name"], "source_id": src["id"], "category": src.get("category", "General")})
    return out


def fetch_all(only: list[dict] | None = None) -> tuple[list[dict], dict[str, str], dict[str, dict]]:
    """Returns (items, errors by source name, stats by source id). only: just these sources (one website's)."""
    active = [s for s in (load_sources() if only is None else only) if s.get("enabled", True)]
    items, errors, stats = [], {}, {}

    def run(src):
        try:
            return src, fetch_source(src), None
        except Exception as e:
            return src, [], str(e)[:200]

    with ThreadPoolExecutor(max_workers=8) as pool:
        for src, found, err in pool.map(run, active):
            stats[src["id"]] = {"count": len(found), "error": err or "",
                                "checked": datetime.now().isoformat(timespec="seconds")}
            if err:
                errors[src["name"]] = err
            items += found
    items.sort(key=lambda i: i.get("date", ""), reverse=True)
    return items, errors, stats


# ---------------------------------------------------------------- auto-detect a new site

def detect(url: str) -> dict:
    """Work out how to read titles from a URL the user pasted. Returns {kind, config, sample}."""
    url = url.strip()
    if not url.startswith("http"):
        url = "https://" + url
    r = _get(url, 40)
    text = r.text.lstrip()

    def ok(kind, config):
        sample = FETCHERS[kind](**config)
        if len(sample) >= 3:
            return {"kind": kind, "config": config, "sample": sample[:8], "label": KIND_LABELS[kind]}
        return None

    # 1. the URL itself is a feed
    if text.startswith("<?xml") or "<rss" in text[:500] or "<feed" in text[:500]:
        found = ok("rss", {"url": r.url})
        if found:
            return found

    soup = BeautifulSoup(r.text, "lxml")
    # 2. the page advertises a feed
    for link in soup.find_all("link", type=re.compile("(rss|atom)\\+xml")):
        try:
            found = ok("rss", {"url": urljoin(r.url, link.get("href", ""))})
            if found:
                return found
        except Exception:
            pass

    # 3. WordPress REST API
    parts = urlparse(r.url)
    for base in (f"{parts.scheme}://{parts.netloc}", r.url.rstrip("/")):
        try:
            found = ok("wordpress", {"base": base})
            if found:
                return found
        except Exception:
            pass

    # 4. plain listing page: the most common link prefix among long link texts
    groups = Counter()
    for a in soup.find_all("a", href=True):
        href = urljoin(r.url, a["href"]).split("#")[0]
        title = " ".join(a.get_text(" ", strip=True).split())
        p = urlparse(href)
        segs = [s for s in p.path.split("/") if s]
        if p.netloc != parts.netloc or len(title) < 20 or len(segs) < 2:
            continue
        groups[f"{p.scheme}://{p.netloc}/{'/'.join(segs[:-1])}/"] += 1
    for prefix, _ in groups.most_common(3):
        found = ok("html", {"url": r.url, "prefix": prefix})
        if found:
            return found
    raise RuntimeError("Could not find a list of articles on this page. Try the site's "
                       "current-affairs page or its RSS feed URL.")
