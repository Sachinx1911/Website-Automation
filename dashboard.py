"""
CurrentFlow dashboard (runs on your laptop):  .venv/bin/python dashboard.py  ->  http://localhost:5050
UI: templates/index.html + static/app.js + static/app.css. This file only serves JSON APIs.
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import date, datetime, timedelta

import requests
from dotenv import set_key
from flask import Flask, abort, g, jsonify, render_template, request, send_file

import logging
import re
from urllib.parse import urlparse

import activity
import automation
import ca
import settings as cfg
import similar
import websites

log = logging.getLogger("currentflow")
AID_RE = re.compile(r"^\d{8}-\d{6}-[a-f0-9]{4}$")
SID_RE = re.compile(r"^[a-f0-9]{8}$")

server = Flask(__name__)
server.config["TEMPLATES_AUTO_RELOAD"] = True
server.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
# multi-website: on the first start the existing WordPress connection (.env) becomes the default website and every
# existing article and automation rule is assigned to it (rules that only scan sources stay shared by all websites)
_default_site = websites.ensure_default(cfg.default_template()["id"], niche=ca.app.SITE_NICHE)
websites.fix_sources([s["id"] for s in ca.sources.load_sources()])
_tpls = cfg.load_templates()
if any(not t.get("website_id") for t in _tpls):
    for _t in _tpls:
        _t["website_id"] = _t.get("website_id") or _default_site["id"]
    cfg.save_templates(_tpls)
_rules = automation.load_rules()
if any("website_id" not in r for r in _rules):
    for _r in _rules:
        _r.setdefault("website_id", "" if _r.get("action") == "fetch" else _default_site["id"])
    automation.save_rules(_rules)
worker = ca.Worker()


@server.context_processor
def _asset_version():
    """Cache-busting: static files get ?v=<mtime> so the browser always loads the latest UI."""
    import os
    def v(name):
        try:
            return int(os.path.getmtime(ca.BASE / "static" / name))
        except OSError:
            return 0
    return {"v": v}
ENV_FILE = ca.BASE / ".env"
_cache: dict = {}


def cached(key: str, ttl: int, fn):
    hit = _cache.get(key)
    if hit and hit[0] > time.time() - ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


# ---------------------------------------------------------------- website context
# The dashboard sends the selected website in the X-Website header ("all" / empty = All Websites). The server checks it
# and scopes every website-dependent query to it: an article, setting, template, rule or WordPress connection of
# website A is never read, changed or used while website B is selected. (Downloads pass it as ?website=.)

@server.before_request
def _website_context():
    wid = (request.headers.get("X-Website") or request.args.get("website") or "").strip()
    g.site = None
    if wid and wid != "all":
        site = websites.get(wid)
        if not site:
            return error("This website does not exist any more. Pick one in the website selector.", 404)
        g.site = site
    activity.current_website.set(g.site["id"] if g.site else "")


def ctx_site() -> dict | None:
    """The website selected in the dashboard, or None for All Websites."""
    return getattr(g, "site", None)


def site_id_of(m: dict) -> str:
    return m.get("website_id") or (websites.default() or {}).get("id", "")


def in_ctx(m: dict) -> bool:
    s = ctx_site()
    return s is None or site_id_of(m) == s["id"]


def ctx_articles() -> list[dict]:
    return [m for m in ca.all_articles() if in_ctx(m)]


def load_ctx_article(aid: str) -> dict:
    """An article of the selected website (another website's article does not exist in this context)."""
    safe_aid(aid)
    try:
        m = ca.load(aid)
    except FileNotFoundError:
        abort(404)
    if not in_ctx(m):
        abort(404)
    return m


def fits_ctx(item: dict) -> bool:
    """A discovered title belongs to the selected website when it fits its sources and niche."""
    s = ctx_site()
    return s is None or websites.relevance(item, s) >= websites.threshold(s)


NEED_SITE = "Select a website in the top bar first."


def ctx_owns(source_id: str) -> bool:
    """A news source is visible in the selected website only when it is one of that website's own sources."""
    s = ctx_site()
    return s is None or websites.owns(s, source_id)


def approved_at(m: dict) -> str:
    """When the article was last approved (by a reviewer or an automation rule), taken from its log."""
    return next((e["t"] for e in reversed(m.get("log", [])) if e.get("msg", "").startswith("Approved by")), "")


def summary(m: dict) -> dict:
    a = m.get("article") or {}
    seo = ca.seo_score(m) if a else {"score": 0, "words": 0, "reading_min": 0, "checks": []}
    return {
        "id": m["id"], "website_id": site_id_of(m), "status": m["status"], "step": m.get("step", ""),
        "title": a.get("title") or m["source"]["title"], "source": m["source"],
        "created": m["created"], "updated": m.get("updated", ""), "started": m.get("started", ""),
        "finished": m.get("finished", ""), "seconds": m.get("seconds"),
        "url": m.get("url", ""), "wp_id": m.get("wp_id"), "error": m.get("error", ""),
        "published_at": m.get("published_at", ""), "scheduled_for": m.get("scheduled_for", ""),
        "has_image": bool(ca.featured_image(m["id"])), "has_text": bool(m.get("source_text")),
        "categories": a.get("categories", []), "tags": a.get("tags", []), "excerpt": a.get("excerpt", ""),
        "slug": a.get("slug", ""), "focus_keyword": a.get("focus_keyword", ""),
        "seo": seo["score"], "words": seo["words"], "reading_min": seo["reading_min"],
        "notes": m.get("notes", ""), "log": m.get("log", [])[-12:],
        "approved_at": approved_at(m), "publish_error": m.get("publish_error", ""),
        "sources": [m["source"]["source"]] + [r["source"] for r in m.get("related", [])],
    }


def counts(items: list[dict]) -> dict:
    c = {"all": len(items)}
    for m in items:
        c[m["status"]] = c.get(m["status"], 0) + 1
    c["working"] = c.get("queued", 0) + c.get("writing", 0)
    c["review"] = sum(c.get(s, 0) for s in ("ready", "changes", "approved", "rejected", "draft", "scheduled"))
    c["pending"] = c.get("selected", 0) + c.get("extracted", 0)
    return c


def error(msg: str, code: int = 400):
    return jsonify(error=msg), code


def safe_aid(aid: str) -> str:
    """Article ids come from the browser; only accept the exact format we generate (no path tricks)."""
    if not AID_RE.match(aid or ""):
        abort(404)
    return aid


def allowed_url(url: str) -> bool:
    """Only fetch pages we discovered ourselves (titles cache / selected articles) — no open proxy."""
    p = urlparse(url or "")
    if p.scheme not in ("http", "https"):
        return False
    known = {i["url"] for i in ca.load_titles()["items"]} | set(ca.used_urls())
    return url in known


@server.errorhandler(Exception)
def _unhandled(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return jsonify(error=e.description or e.name), e.code
    log.exception("Unhandled error")
    activity.log("Unexpected error", "System", f"{type(e).__name__}: {e}"[:300], "failed", user="System")
    return jsonify(error=f"Something went wrong on the server: {type(e).__name__}: {str(e)[:200]}"), 500


@server.get("/api/health")
def health():
    return jsonify(ok=True, articles=len(ca.all_articles()), queue=len(worker.queue), writing=worker.active,
                   wp=ca.wp_ready(), time=datetime.now().isoformat(timespec="seconds"))


@server.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------- overview

@server.get("/api/state")
def state():
    site = ctx_site()
    items = ctx_articles()
    titles = ca.load_titles()
    gone = websites.hidden_urls(site["id"] if site else "")
    tits = [t for t in titles["items"] if fits_ctx(t) and t["url"] not in gone]
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    srcs = [s for s in ca.sources.load_sources() if ctx_owns(s["id"])]
    return jsonify(
        wp_ready=ca.wp_ready(site) if site else any(websites.connected(w) for w in websites.active()),
        wp_url=websites.wp_config(site)[0] if site else "", today=today, counts=counts(items),
        website=websites.public(site) if site else None, websites_total=len(websites.load()),
        sources_total=len(srcs), sources_active=sum(1 for s in srcs if s.get("enabled", True)),
        sources_errors=sum(1 for s in srcs if s.get("enabled", True) and titles.get("stats", {}).get(s["id"], {}).get("error")),
        titles_total=len(tits), titles_today=sum(1 for t in tits if t.get("date") == today),
        titles_yesterday=sum(1 for t in tits if t.get("date") == yesterday),
        fetched_at=(titles.get("fetched_at") if site is None
                    else max((titles.get("stats", {}).get(s["id"], {}).get("checked") or "" for s in srcs), default="") or None),
        published_today=sum(1 for m in items if (m.get("published_at") or "").startswith(today)),
        published_yesterday=sum(1 for m in items if (m.get("published_at") or "").startswith(yesterday)),
        storage_bytes=ca.storage_bytes(), writers=cfg.load_settings().get("writers", 2),
        working_now=worker.active, user_name=cfg.load_settings()["app"].get("user_name", "Sachin"),
        claude_plan=(_cache.get("claude") or (0, {}))[1].get("plan", ""),
    )


@server.get("/api/notifications")
def notifications():
    events = []
    for m in ctx_articles()[:60]:
        for e in m.get("log", []):
            if e["level"] in ("ok", "err"):
                events.append({"t": e["t"], "msg": e["msg"], "level": e["level"], "id": m["id"],
                               "title": (m.get("article") or {}).get("title") or m["source"]["title"]})
    events.sort(key=lambda e: e["t"], reverse=True)
    return jsonify(items=events[:25])


# ---------------------------------------------------------------- titles / discover

@server.get("/api/titles")
def titles():
    data = ca.load_titles()
    site, act = ctx_site(), websites.active()
    if site:   # another website's sources (and their news, errors and numbers) do not exist here
        names = {s["name"] for s in ca.sources.load_sources() if websites.owns(site, s["id"])}
        data["items"] = [i for i in data["items"] if websites.owns(site, i.get("source_id"))]
        data["errors"] = {k: v for k, v in (data.get("errors") or {}).items() if k in names}
        data["stats"] = {k: v for k, v in (data.get("stats") or {}).items() if websites.owns(site, k)}
    if not site:   # the same address read for two websites is one news item here
        seen_urls = set()
        data["items"] = [i for i in data["items"] if not (i["url"] in seen_urls or seen_urls.add(i["url"]))]
    used = ca.used_by(site["id"] if site else "")
    groups = similar.groups(data["items"]) if cfg.load_settings()["app"].get("combine_sources", True) else {}
    lead_of = {i["url"]: lead for lead, grp in groups.items() for i in grp}
    score = {(it["url"], w["id"]): websites.relevance(it, w) for it in data["items"] for w in act}
    for it in data["items"]:
        lead = lead_of.get(it["url"])
        members = groups[lead] if lead else [it]
        # written already (from any source of the story) -> by which article and for which website
        ref = next((used[o["url"]] for o in [it] + members if o["url"] in used), None)
        it["article_id"], it["used_by"] = (ref["id"], ref["website_id"]) if ref else (None, "")
        # niche relevance per website (a story counts with its best source); "fits" = websites at/above their threshold
        best = {w["id"]: max(score[(o["url"], w["id"])] for o in members) for w in act}
        it["fits"] = [w["id"] for w in act if best[w["id"]] >= websites.threshold(w)]
        if site:
            it["relevance"] = best.get(site["id"], 0)
        if lead:   # same story on several sources: Discover shows the lead row with the others listed under it
            it["group"] = lead
            it["also"] = [{"source": o["source"], "title": o["title"], "url": o["url"], "date": o.get("date", "")} for o in groups[lead] if o["url"] != it["url"]]
    gone = websites.hidden_urls(site["id"] if site else "")
    if gone:   # deleted news never comes back, not even from another source of the same story
        data["items"] = [it for it in data["items"]
                         if not any(o["url"] in gone for o in (groups[lead_of[it["url"]]] if it["url"] in lead_of else [it]))]
    if site:
        data["threshold"] = websites.threshold(site)
    return jsonify(data)


@server.post("/api/titles/hide")
def hide_titles():
    """Delete news from Discover: never listed again for the selected website (All Websites: for every website)."""
    news = []
    for i in (request.json or {}).get("items") or []:
        news += [{"url": u, "title": i.get("title", "")} for u in [i.get("url")] + list(i.get("also") or [])]
    news = [n for n in news if str(n["url"] or "").startswith(("http://", "https://"))]
    site = ctx_site()
    websites.hide_news(site["id"] if site else "", news)
    activity.log("News deleted from Discover", "Sources", ", ".join(n["title"] for n in news)[:300] or f"{len(news)} news")
    return jsonify(ok=True, hidden=len(news))


def do_scan(user: str = "You", site: dict | None = None) -> dict:
    """Scan one website's own sources, or every source (All Websites and the shared automation rule)."""
    own = [s for s in ca.sources.load_sources() if websites.owns(site, s["id"])] if site else None
    before = {i["url"] for i in ca.load_titles()["items"]}
    data = ca.refresh_titles(own)
    mine = [i for i in data["items"] if not site or websites.owns(site, i.get("source_id"))]
    errs = [k for k in data["errors"] if own is None or k in {s["name"] for s in own}]
    new = [i for i in mine if i["url"] not in before]
    activity.log("Scanned sources", "Sources", f"{len(mine)} titles, {len(new)} new, {len(errs)} errors",
                 "failed" if errs and not mine else "success", user=user)
    used = ca.used_urls()
    groups = similar.groups(data["items"]) if cfg.load_settings()["app"].get("combine_sources", True) else {}
    story = {i["url"]: [o["url"] for o in grp] for grp in groups.values() for i in grp}
    for it in new:
        if it["url"] not in used:   # story_urls: every source of the same story (a deleted story stays deleted)
            automation.fire("new_article", it | {"story_urls": story.get(it["url"], [it["url"]])})
    return data


@server.post("/api/titles/refresh")
def refresh_titles():
    do_scan(site=ctx_site())
    return titles()


@server.get("/api/meta")
def meta():
    url = request.args.get("url", "")
    if not allowed_url(url):
        return jsonify(image="", description="")
    return jsonify(ca.page_meta(url))


@server.get("/api/preview")
def preview():
    url = request.args.get("url", "")
    if not allowed_url(url):
        return error("Preview is only available for discovered articles")
    try:
        src = ca.fetch_source(url)
        return jsonify(text=src["text"][:2500], words=len(src["text"].split()), image=src["image"])
    except Exception as e:
        return error(str(e)[:300])


_select_lock = threading.Lock()   # automation rules may select from several threads at once


def select_items(items: list[dict], user: str = "You", website_id: str = "", force: bool = False) -> list[str]:
    """Create articles for one website. One source story -> one primary website: news already written for another
    website is skipped unless force (an explicit admin decision to write it for this website too)."""
    website_id = website_id or (websites.default() or {}).get("id", "")
    with _select_lock:
        all_titles = ca.load_titles()["items"]
        used = ca.used_by(website_id)
        known = {i["url"]: i for i in all_titles}
        combine = cfg.load_settings()["app"].get("combine_sources", True)
        ids = []
        for item in items:
            if item.get("url") not in known and item.get("url") not in used:
                continue  # ignore urls that did not come from a scan
            item = known.get(item["url"], item)
            # the same story on other sources is combined into this article
            group = similar.group_of(item["url"], all_titles) if combine else []
            done = next((used[g["url"]] for g in [item] + group if g["url"] in used), None)
            if done and (done["website_id"] == website_id or not force):
                ids.append(done["id"])   # already written (for this website, or for another one without force)
                continue
            if group and item["url"] != group[0]["url"]:
                item = group[0]   # the official / lead source becomes the main one
            related = [g for g in group if g["url"] != item["url"]]
            m = ca.create_selection(item, related, website_id)
            for u in [item["url"]] + [r["url"] for r in related]:
                used[u] = {"id": m["id"], "website_id": website_id}
            ids.append(m["id"])
            activity.log("Article selected", "Articles", item["title"] + (f" (+{len(related)} more sources)" if related else ""), user=user, article_id=m["id"])
            if cfg.load_settings()["app"].get("auto_extract", True):
                threading.Thread(target=lambda a=m["id"]: _safe_extract(a), daemon=True).start()
        return ids


def _safe_extract(aid):
    try:
        ca.extract(aid)
    except Exception:
        pass


@server.post("/api/select")
def select():
    d = request.json or {}
    site = ctx_site() or websites.get(d.get("website_id"))   # All Websites mode: the dashboard asks which website
    if not site or site.get("status") == "inactive":
        return error(NEED_SITE if not site else f"{site['name']} is deactivated.")
    ids = select_items(d.get("items", []), website_id=site["id"], force=bool(d.get("force")))
    if d.get("process"):
        for aid in ids:
            m = ca.load(aid)
            if m["status"] not in ca.WORKING and site_id_of(m) == site["id"] and not m.get("article"):
                ca.set_status(aid, "queued", "Queued for Claude AI", step="")
                worker.add(aid)
    return jsonify(ids=ids)


# ---------------------------------------------------------------- articles

@server.get("/api/articles")
def articles():
    items = ctx_articles()
    return jsonify(items=[summary(m) for m in items], counts=counts(items))


@server.get("/api/articles/<aid>")
def article(aid):
    m = load_ctx_article(aid)
    return jsonify(summary(m) | {"article": m.get("article"), "source_text": m.get("source_text", ""),
                                 "related": m.get("related", []), "related_texts": m.get("related_texts", []),
                                 "source_image": m.get("source_image", ""), "log": m.get("log", []),
                                 "seo_detail": ca.seo_score(m), "template_id": m.get("template_id")})


@server.post("/api/articles/<aid>/edit")
def edit(aid):
    m = load_ctx_article(aid)
    d = request.json
    if "notes" in d:
        m["notes"] = d["notes"]
    if m.get("article"):
        for key in ("title", "excerpt", "content_html", "focus_keyword", "slug"):
            if key in d:
                m["article"][key] = d[key]
        for key in ("tags", "categories"):
            if key in d:
                m["article"][key] = [t.strip() for t in d[key] if str(t).strip()]
    if "template_id" in d:
        m["template_id"] = d["template_id"]
    ca.log(m, "Edited in Review Center")
    ca.save(m)
    activity.log("Article updated", "Articles", (m.get("article") or m["source"])["title"], article_id=aid)
    return article(aid)


@server.post("/api/articles/<aid>/image")
def upload_image(aid):
    load_ctx_article(aid)
    f = request.files.get("image")
    if not f or not f.filename:
        return error("No image received")
    if not (f.mimetype or "").startswith("image/"):
        return error("Only image files are allowed")
    ca.set_featured_image(aid, f.read(), f.filename)
    m = ca.load(aid)
    ca.log(m, "Featured image replaced")
    ca.save(m)
    return article(aid)


@server.post("/api/articles/bulk")
def bulk():
    d = request.json
    action, ids = d["action"], d.get("ids", [])
    done, failed = [], []
    for aid in ids:
        if not AID_RE.match(str(aid)):
            failed.append({"id": aid, "error": "Invalid article id"})
            continue
        mine = False
        try:
            m = ca.load(aid)
            if not in_ctx(m):
                raise RuntimeError("This article belongs to another website")
            mine = True
            st = m["status"]
            if action == "extract":
                if st in ("selected", "error") or not m.get("source_text"):
                    ca.extract(aid)
            elif action == "process":
                if st in ca.WORKING:
                    continue
                ca.set_status(aid, "queued", "Queued for Claude AI", step="")
                worker.add(aid)
            elif action == "pause":
                if st == "queued":
                    worker.remove(aid)
                    ca.set_status(aid, "paused", "Paused by user")
            elif action == "resume":
                if st == "paused":
                    ca.set_status(aid, "queued", "Resumed")
                    worker.add(aid)
            elif action == "retry":
                worker.remove(aid)
                ca.set_status(aid, "queued", "Re-queued (rewrite)", step="", error="")
                worker.add(aid)
            elif action in ("approve", "reject", "changes"):
                if not m.get("article"):
                    raise RuntimeError("Article is not written yet")
                label = {"approve": ("approved", "Approved by reviewer"), "reject": ("rejected", "Rejected by reviewer"),
                         "changes": ("changes", "Marked as needs modification")}[action]
                m = ca.set_status(aid, label[0], label[1], "ok" if action == "approve" else "info")
                activity.log(f"Article {label[0]}", "Articles", m["article"]["title"], article_id=aid)
                if action == "approve":
                    automation.fire("article_approved", ca.event_payload(m))
            elif action in ("publish", "draft", "schedule"):
                if not m.get("article"):
                    raise RuntimeError("Article is not written yet")
                site = websites.site_of(m)   # always the article's own website
                if not ca.wp_ready(site):
                    raise RuntimeError(f"{(site or {}).get('name', 'This website')} is not connected to WordPress")
                if action == "schedule":
                    ca.save_to_wp(aid, "future", d.get("when"))
                else:
                    ca.save_to_wp(aid, "publish" if action == "publish" else "draft")
            elif action == "delete":
                if m.get("wp_id") or m["status"] in ("published", "scheduled"):
                    websites.hide_news(site_id_of(m), [m["source"]] + m.get("related", []))
                worker.remove(aid)
                shutil.rmtree(ca.CA_DIR / aid)
                activity.log("Article removed", "Articles", (m.get("article") or m["source"])["title"], article_id=aid)
            else:
                raise RuntimeError(f"Unknown action {action}")
            done.append(aid)
        except Exception as e:
            failed.append({"id": aid, "error": str(e)[:300]})
            if mine and action in ("publish", "draft", "schedule"):
                note_publish_error(aid, str(e))
    return jsonify(done=done, failed=failed)


def note_publish_error(aid: str, msg: str) -> None:
    """Remember a failed WordPress publish on the article, so the Approved Articles page can list it under Failed
    (save_to_wp clears it again on the next successful publish)."""
    try:
        m = ca.load(aid)
    except FileNotFoundError:
        return
    m["publish_error"] = msg[:300]
    ca.log(m, f"WordPress publish failed: {msg[:200]}", "err")
    ca.save(m)


@server.route("/image/<aid>")
def image(aid):
    safe_aid(aid)
    img = ca.featured_image(aid)
    if not img:
        abort(404)
    return send_file(img, max_age=0)


# ---------------------------------------------------------------- sources

def _source_view(s: dict, stats: dict, items: list[dict]) -> dict:
    today = date.today().isoformat()
    return s | {"label": ca.sources.KIND_LABELS.get(s["kind"], s["kind"]), "stats": stats.get(s["id"], {}),
                "today": sum(1 for i in items if i.get("source_id") == s["id"] and i.get("date") == today),
                "total": sum(1 for i in items if i.get("source_id") == s["id"])}


@server.get("/api/sources")
def list_sources():
    t, sites = ca.load_titles(), websites.load()
    items = [_source_view(s, t.get("stats", {}), t["items"]) | {"websites": [w["id"] for w in sites if websites.owns(w, s["id"])]}
             for s in ca.sources.load_sources() if ctx_owns(s["id"])]
    return jsonify(items=items, categories=ca.sources.CATEGORIES)


@server.post("/api/sources/detect")
def detect_source():
    try:
        return jsonify(ca.sources.detect(request.json["url"]))
    except Exception as e:
        return error(str(e)[:300])


def _norm_url(url: str | None) -> str:
    return re.sub(r"^https?://(www\.)?", "", (url or "").strip()).rstrip("/").lower()


@server.post("/api/sources")
def add_source():
    d = request.json
    site = ctx_site()
    if not site:
        return error(NEED_SITE + " A new source belongs to that website.")
    if not d.get("name") or not d.get("url"):
        return error("Source name and website URL are required")
    same = next((s for s in ca.sources.load_sources() if _norm_url(s.get("site")) == _norm_url(d["url"])), None)
    if same:   # already scanned for another website: share it instead of scanning the same site twice
        if websites.owns(site, same["id"]):
            return error(f"{same['name']} is already one of {site['name']}'s sources")
        websites.set_source(site["id"], same["id"], True, [s["id"] for s in ca.sources.load_sources()])
        activity.log("New source added", "Sources", same["name"])
        return jsonify(same)
    try:
        det = d.get("detected") or ca.sources.detect(d["url"])
    except Exception as e:
        return error(str(e)[:300])
    src = ca.sources.add_source(d["name"], det["kind"], det["config"], site=d["url"],
                                category=d.get("category", "General"), description=d.get("description", ""),
                                frequency=d.get("frequency", "manual"), section=d.get("section", ""))
    websites.set_source(site["id"], src["id"], True, [s["id"] for s in ca.sources.load_sources()])   # this website only
    threading.Thread(target=ca.refresh_one_source, args=(src,), daemon=True).start()
    activity.log("New source added", "Sources", src["name"])
    return jsonify(src)


@server.patch("/api/sources/<sid>")
def update_source(sid):
    if not SID_RE.match(sid or "") or not ctx_owns(sid):
        abort(404)
    d = dict(request.json)
    site, copied = ctx_site(), None
    if site and len(websites.users_of(sid)) > 1:
        cur = next(s for s in ca.sources.load_sources() if s["id"] == sid)
        copied = ca.sources.add_source(cur["name"], cur["kind"], cur["config"],
                                       **{k: cur[k] for k in ca.sources.EDITABLE if k in cur and k != "name"})
        ids = [s["id"] for s in ca.sources.load_sources()]
        websites.set_source(site["id"], sid, False, ids)
        websites.set_source(site["id"], copied["id"], True, ids)
        sid = copied["id"]
    if d.get("url"):
        current = next((s for s in ca.sources.load_sources() if s["id"] == sid), None)
        if current and d["url"].rstrip("/") != (current.get("site") or "").rstrip("/"):
            try:
                det = ca.sources.detect(d["url"])
                d.update(kind=det["kind"], config=det["config"])
            except Exception as e:
                return error(str(e)[:300])
        d["site"] = d.pop("url")
    try:
        src = ca.sources.update_source(sid, **d)
    except KeyError:
        abort(404)
    if copied and src.get("enabled", True):
        threading.Thread(target=ca.refresh_one_source, args=(src,), daemon=True).start()
    return jsonify(src)


@server.delete("/api/sources/<sid>")
def delete_source(sid):
    if not SID_RE.match(sid or "") or not ctx_owns(sid):
        abort(404)
    name = next((s["name"] for s in ca.sources.load_sources() if s["id"] == sid), sid)
    site = ctx_site()
    if site:
        websites.set_source(site["id"], sid, False, [s["id"] for s in ca.sources.load_sources()])
    if not site or not websites.users_of(sid):
        ca.sources.remove_source(sid)
        websites.drop_source(sid)
    activity.log("Source removed", "Sources", name)
    return jsonify(ok=True)


@server.post("/api/sources/<sid>/scan")
def scan_source(sid):
    if not SID_RE.match(sid or "") or not ctx_owns(sid):
        abort(404)
    src = next((s for s in ca.sources.load_sources() if s["id"] == sid), None)
    if not src:
        abort(404)
    data = ca.refresh_one_source(src)
    return jsonify(stats=data["stats"].get(sid, {}), count=data["stats"].get(sid, {}).get("count", 0))


# ---------------------------------------------------------------- settings / templates

@server.get("/api/settings")
def get_settings():
    site = ctx_site()
    return jsonify(cfg.load_settings(site) | {"_website": site["id"] if site else "", "_site_sections": list(websites.SITE_SECTIONS)})


@server.post("/api/settings")
def post_settings():
    """With a website selected, its publishing / SEO / content / structure settings are saved for that website only;
    everything else (and everything in All Websites mode) is a global setting."""
    d, site = request.json or {}, ctx_site()
    if site:
        own = {k: v for k, v in d.items() if k in websites.SITE_SECTIONS}
        if own:
            websites.save_settings(site["id"], own)
        d = {k: v for k, v in d.items() if k not in websites.SITE_SECTIONS}
    if d:
        cfg.save_settings(d)
    activity.log("Settings saved", "Settings", ", ".join((request.json or {}).keys()))
    return get_settings()


@server.post("/api/settings/reset")
def reset_settings():
    site = ctx_site()
    if site:   # only this website's own settings go back to the global defaults
        websites.reset_settings(site["id"])
        activity.log("Website settings reset to defaults", "Settings", site["name"])
        return get_settings()
    if cfg.SETTINGS_FILE.exists():
        cfg.SETTINGS_FILE.unlink()
    activity.log("Settings reset to defaults", "Settings")
    return get_settings()


@server.post("/api/cache/clear")
def clear_cache():
    n = 0
    for p in (ca.META_CACHE, ca.TITLES_CACHE):
        if p.exists():
            p.unlink(); n += 1
    ca._meta_cache.clear(); _cache.clear(); ca._catalog_cache.clear()
    activity.log("Cache cleared", "System", f"{n} cache files removed")
    return jsonify(ok=True)


@server.get("/api/templates")
def get_templates():
    """The selected website's templates (plus shared ones); "default" marks the one its articles use."""
    site = ctx_site()
    items = cfg.templates_for(site)
    if site:
        own = cfg.get_template(None, site)["id"]
        items = [t | {"default": t["id"] == own} for t in items]
    return jsonify(items=items)


@server.post("/api/templates")
def post_template():
    d, site = request.json or {}, ctx_site()
    if site and d.get("id") and not any(t["id"] == d["id"] for t in cfg.templates_for(site)):
        abort(404)
    tpl = cfg.upsert_template(d, site["id"] if site else None)
    if site and d.get("default"):
        websites.upsert({"id": site["id"], "template_id": tpl["id"]})
    return jsonify(tpl)


@server.delete("/api/templates/<tid>")
def delete_template(tid):
    site = ctx_site()
    if site and not any(t["id"] == tid for t in cfg.templates_for(site)):
        abort(404)
    if any(w.get("template_id") == tid for w in websites.load()):
        return error("A website uses this template as its default. Pick another default first.")
    try:
        cfg.delete_template(tid)
    except ValueError as e:
        return error(str(e))
    return jsonify(ok=True)


@server.post("/api/templates/test")
def test_template():
    """Write one article with an unsaved template (slow: 2-5 minutes)."""
    d = request.json
    tpl = {"system": d.get("system", ""), "user": d.get("user", cfg.DEFAULT_USER_PROMPT), "model": d.get("model", "")}
    item = d.get("item") or {}
    if not item.get("url"):
        return error("Pick a news item to test with")
    meta = {"id": "test", "website_id": (ctx_site() or websites.default() or {}).get("id", ""),
            "source": {k: item.get(k, "") for k in ("title", "url", "source", "date", "category")}}
    try:
        src = ca.fetch_source(item["url"])
        meta["source_text"] = src["text"]
        started = time.time()
        art = ca.write_article(meta, tpl)
        return jsonify(article=art, seconds=int(time.time() - started), image=src["image"])
    except Exception as e:
        return error(str(e)[:400], 500)


@server.get("/api/stats/claude")
def claude_stats():
    items = [m for m in ctx_articles() if m.get("article")]
    month = date.today().strftime("%Y-%m")
    scores = [ca.seo_score(m)["score"] for m in items]
    secs = [m["seconds"] for m in items if m.get("seconds")]
    return jsonify(generated_month=sum(1 for m in items if m["created"].startswith(month)), generated_total=len(items),
                   avg_seo=round(sum(scores) / len(scores)) if scores else 0,
                   avg_seconds=round(sum(secs) / len(secs)) if secs else 0,
                   sample=[{"title": t["title"], "url": t["url"], "source": t["source"], "date": t.get("date", ""),
                            "category": t.get("category", "")} for t in ca.load_titles()["items"] if fits_ctx(t)][:40])


# ---------------------------------------------------------------- WordPress

@server.get("/api/wordpress")
def wordpress():
    site = ctx_site()
    if not site:   # All Websites: a summary of every connection
        act = websites.active()
        return jsonify(connected=any(websites.connected(w) for w in act), all_websites=True,
                       name=f"{len(act)} website{'s' if len(act) != 1 else ''}", url="",
                       websites=[{"id": w["id"], "name": w["name"], "connected": websites.connected(w)} for w in act])
    info = cached(f"wp_info:{site['id']}", 120, lambda: ca.wp_info(site))
    url, user, password = websites.wp_config(site)
    return jsonify(info | {"user_login": user, "has_password": bool(password), "url": info.get("url") or url})


@server.get("/api/wordpress/lists")
def wordpress_lists():
    site = ctx_site()
    if not site:
        return jsonify(authors=[], categories=[])
    return jsonify(cached(f"wp_lists:{site['id']}", 600, lambda: ca.wp_lists(site)))


def _check_wp(url: str, user: str, password: str):
    """Log in to WordPress once; returns (name, None) or (None, error message)."""
    try:
        r = requests.get(f"{url}/wp-json/wp/v2/users/me", auth=(user, password), timeout=30,
                         headers={"User-Agent": "wp-article-automation/1.0"})
    except requests.RequestException as e:
        return None, f"Could not reach the site: {e}"[:300]
    if r.status_code in (401, 403):
        return None, "WordPress rejected the login. Check the username and application password."
    if r.status_code == 404 or "json" not in r.headers.get("content-type", ""):
        return None, "WordPress REST API was not found at this URL."
    if not r.ok:
        return None, f"WordPress returned HTTP {r.status_code}"
    return r.json().get("name", user), None


def _connect_site(site: dict, url: str, user: str, password: str):
    """Save a checked WordPress connection for this website only (its password in .env under its own key)."""
    name, err = _check_wp(url, user, password)
    if err:
        return None, err
    websites.set_wp(site["id"], url, user, password)
    if site.get("is_default"):   # keep the old single-site .env keys in step (used by the app.py command line)
        for key, value in (("WP_URL", url), ("WP_USER", user)):
            set_key(str(ENV_FILE), key, value, quote_mode="never")
        ca.app.WP_URL, ca.app.WP_USER, ca.app.WP_APP_PASSWORD = url, user, password
    ca._catalog_cache.pop(site["id"], None)
    for k in [k for k in _cache if k.startswith(("wp_info", "wp_lists"))]:
        _cache.pop(k, None)
    activity.log("WordPress connected", "WordPress", f"{site['name']}: {url}", website_id=site["id"])
    return name, None


@server.post("/api/wordpress/connect")
def wp_connect():
    site = ctx_site()
    if not site:
        return error(NEED_SITE)
    d = request.json
    url = (d.get("url") or "").strip().rstrip("/")
    user = (d.get("user") or "").strip()
    password = (d.get("password") or "").strip() or websites.wp_config(site)[2]
    if not (url and user and password):
        return error("Site URL, username and application password are all required")
    name, err = _connect_site(site, url, user, password)
    if err:
        return error(err)
    return jsonify(ok=True, name=name, url=url)


@server.post("/api/wordpress/test")
def wp_test():
    site = ctx_site()
    if not site:
        return error(NEED_SITE)
    _cache.pop(f"wp_info:{site['id']}", None)
    info = ca.wp_info(site)
    if not info.get("connected"):
        return error("WordPress is not configured")
    if info.get("error"):
        return error(info["error"])
    return jsonify(info)


# ---------------------------------------------------------------- websites

@server.get("/api/websites")
def list_websites():
    """Every website (no passwords) with its article numbers, for the selector and Websites & Publishing."""
    arts, today = ca.all_articles(), date.today().isoformat()
    out = []
    for w in websites.load():
        mine = [m for m in arts if site_id_of(m) == w["id"]]
        c = counts(mine)
        out.append(websites.public(w) | {"stats": {
            "articles": len(mine), "working": c["working"], "review": c.get("ready", 0) + c.get("changes", 0),
            "approved": c.get("approved", 0), "scheduled": c.get("scheduled", 0), "published": c.get("published", 0),
            "published_today": sum(1 for m in mine if (m.get("published_at") or "").startswith(today)),
            "failed": sum(1 for m in mine if m.get("publish_error") and m["status"] != "published")}})
    return jsonify(items=out, default=(websites.default() or {}).get("id"))


@server.post("/api/websites")
def save_website():
    """Add or edit a website. A new website gets its own starter Claude template; WordPress details (optional) are
    checked by logging in before they are saved."""
    d = request.json or {}
    is_new = not d.get("id")
    if not is_new and not websites.get(d["id"]):
        abort(404)
    try:
        site = websites.upsert(d)
    except ValueError as e:
        return error(str(e))
    if is_new:
        tpl = cfg.upsert_template({"name": f"{site['name']} – Standard", "model": "",
                                   "description": f"Starter template for {site['name']} ({site.get('niche') or 'general'})",
                                   "system": websites.starter_system(site), "user": cfg.DEFAULT_USER_PROMPT}, site["id"])
        site = websites.upsert({"id": site["id"], "template_id": tpl["id"]})
    activity.log("Website added" if is_new else "Website updated", "System", site["name"], website_id=site["id"])
    wp = d.get("wp") or {}
    out = {}
    if wp.get("url") and wp.get("user"):
        password = (wp.get("password") or "").strip() or websites.wp_config(site)[2]
        if password:
            _, err = _connect_site(site, wp["url"].strip().rstrip("/"), wp["user"].strip(), password)
            if err:
                out["wp_error"] = err
    return jsonify(websites.public(websites.get(site["id"])) | out)


@server.delete("/api/websites/<wid>")
def delete_website(wid):
    """Delete a website without articles (with its own templates and rules). One with articles: deactivate instead."""
    site = websites.get(wid) or abort(404)
    try:
        websites.remove(wid, sum(1 for m in ca.all_articles() if site_id_of(m) == wid))
    except ValueError as e:
        return error(str(e))
    cfg.save_templates([t for t in cfg.load_templates() if t.get("website_id") != wid])
    automation.save_rules([r for r in automation.load_rules() if r.get("website_id") != wid])
    for s in ca.sources.load_sources():   # sources no other website uses
        if not websites.users_of(s["id"]):
            ca.sources.remove_source(s["id"])
    activity.log("Website deleted", "System", site["name"], website_id="")
    return jsonify(ok=True)


@server.post("/api/websites/<wid>/sources")
def website_sources(wid):
    """Which news sources a website uses: {"all": true} or {"source_id": ..., "assigned": bool}."""
    if not websites.get(wid):
        abort(404)
    d = request.json or {}
    if d.get("all"):
        websites.upsert({"id": wid, "source_ids": [s["id"] for s in ca.sources.load_sources()]})
    else:
        websites.set_source(wid, str(d.get("source_id")), bool(d.get("assigned")), [s["id"] for s in ca.sources.load_sources()])
    return jsonify(websites.public(websites.get(wid)))


# ---------------------------------------------------------------- Claude

def _claude_check() -> dict:
    try:
        out = subprocess.run([ca.app.claude_bin(), "auth", "status"], capture_output=True, text=True,
                             encoding="utf-8", timeout=30, env=ca.app.claude_env())
        info = json.loads(out.stdout)
        return {"installed": True, "logged_in": info.get("loggedIn", False), "plan": info.get("subscriptionType", "")}
    except FileNotFoundError:
        return {"installed": False, "logged_in": False}
    except Exception as e:
        return {"installed": True, "logged_in": False, "error": str(e)[:200]}


@server.get("/api/claude/status")
def claude_status():
    if request.args.get("fresh"):
        _cache.pop("claude", None)
    return jsonify(cached("claude", 300, _claude_check))


# Log in to Claude Code from the dashboard. `claude auth login` opens the sign-in page in the browser and then
# waits for the code that page shows; the dashboard keeps the process running and passes the pasted code to it.
_login: dict = {"proc": None, "out": ""}
_login_lock = threading.Lock()


def _login_stop() -> None:
    p = _login.get("proc")
    if p and p.poll() is None:
        p.kill()
    _login.update(proc=None, out="")


def _login_read(proc) -> None:
    for ch in iter(lambda: proc.stdout.read(1), ""):
        _login["out"] += ch


def _no_browser() -> str:
    """A browser command that does nothing: Claude Code opens the page through $BROWSER, and the dashboard opens
    it itself (on claude.ai), so only one tab appears."""
    if os.name != "nt":
        return "true"
    bat = ca.CACHE_DIR / "no-browser.bat"
    if not bat.exists():
        bat.parent.mkdir(exist_ok=True)
        bat.write_text("@exit /b 0\r\n", encoding="ascii")
    return str(bat)


@server.post("/api/claude/login/start")
def claude_login_start():
    with _login_lock:
        _login_stop()
        env = ca.app.claude_env() | {"BROWSER": _no_browser()}
        try:
            proc = subprocess.Popen([ca.app.claude_bin(), "auth", "login"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=env)
        except FileNotFoundError:
            return error("Claude Code is not installed on this laptop.")
        _login.update(proc=proc, out="")
        threading.Thread(target=_login_read, args=(proc,), daemon=True).start()
        for _ in range(80):   # the sign-in link appears within a second or two
            m = re.search(r"https://\S+/oauth/authorize\S+", _login["out"])
            if m:
                # claude.com/cai/oauth/authorize only forwards (same parameters) to claude.ai, where the browser is
                # already logged in, so go there directly
                url = re.sub(r"^https://claude\.com/cai/oauth/authorize", "https://claude.ai/oauth/authorize", m.group(0))
                _login["url"] = url
                webbrowser.open(url)
                activity.log("Claude login started", "System")
                return jsonify(url=url)
            if proc.poll() is not None:
                break
            time.sleep(0.25)
        out = _login["out"].strip()
        _login_stop()
        return error(f"Claude Code did not start the sign-in. {out[-300:]}".strip())


@server.post("/api/claude/login/code")
def claude_login_code():
    code = ((request.json or {}).get("code") or "").strip()
    if not code:
        return error("Paste the code shown on the Claude page after you click Authorize.")
    with _login_lock:
        proc = _login.get("proc")
        if not proc or proc.poll() is not None:
            return error("This sign-in has expired. Click “Log in to Claude” again.")
        before = len(_login["out"])
        proc.stdin.write(code + "\n")
        proc.stdin.flush()
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            pass
        reply = _login["out"][before:].strip()
        _login_stop()
    _cache.pop("claude", None)
    status = cached("claude", 300, _claude_check)
    if status.get("logged_in"):
        activity.log("Claude logged in", "System", status.get("plan", ""))
        return jsonify(status)
    activity.log("Claude login failed", "System", reply[-200:], "failed")
    return error(f"Login did not complete. {reply[-300:] or 'Try again with a fresh code.'}".strip())


@server.post("/api/claude/login/open")
def claude_login_open():
    """Open the sign-in page in the laptop's default browser (where claude.ai is usually logged in, so the page
    shows the account with an Authorize button) instead of inside whatever window shows the dashboard."""
    url = _login.get("url")
    proc = _login.get("proc")
    if not url or not proc or proc.poll() is not None:
        return error("This sign-in has expired. Click “Log in to Claude” again.")
    webbrowser.open(url)
    return jsonify(ok=True)


@server.get("/api/claude/login/poll")
def claude_login_poll():
    """While the login window is open: did the sign-in finish on its own (no code needed)?"""
    proc = _login.get("proc")
    if proc and proc.poll() is None:
        return jsonify(done=False, running=True)
    _cache.pop("claude", None)
    status = cached("claude", 300, _claude_check)
    if status.get("logged_in") and proc:
        with _login_lock:
            _login_stop()
        activity.log("Claude logged in", "System", status.get("plan", ""))
    return jsonify(done=bool(status.get("logged_in")), running=False, **status)


@server.post("/api/claude/login/cancel")
def claude_login_cancel():
    with _login_lock:
        _login_stop()
    return jsonify(ok=True)


@server.post("/api/claude/logout")
def claude_logout():
    subprocess.run([ca.app.claude_bin(), "auth", "logout"], capture_output=True, text=True, encoding="utf-8",
                   timeout=60, env=ca.app.claude_env())
    _cache.pop("claude", None)
    activity.log("Claude logged out", "System")
    return jsonify(cached("claude", 300, _claude_check))


# ---------------------------------------------------------------- automation rules

def _act_fetch(rule, payload):
    data = do_scan(user="System", site=websites.get(rule.get("website_id")))
    return f"fetched {len(data['items'])} titles"


def _rule_site(rule, payload):
    """The website a rule works for: its own, or (shared rule) the website this news fits best."""
    site = websites.get(rule.get("website_id")) or websites.best_site(payload)
    if not site:
        raise RuntimeError("this news does not fit any website's niche")
    return site


def _act_generate(rule, payload):
    if not payload.get("url"):
        raise RuntimeError("no article in event")
    site = _rule_site(rule, payload)
    ids = [a for a in select_items([payload], user="System", website_id=site["id"]) if site_id_of(ca.load(a)) == site["id"]]
    for aid in ids:
        if ca.load(aid)["status"] not in ca.WORKING and not ca.load(aid).get("article"):
            ca.set_status(aid, "queued", f"Queued by rule '{rule['name']}'", step="")
            worker.add(aid)
    return f"queued '{payload.get('title', '')[:60]}'"


def _act_extract(rule, payload):
    if payload.get("url"):
        site = _rule_site(rule, payload)
        ids = [a for a in select_items([payload], user="System", website_id=site["id"]) if site_id_of(ca.load(a)) == site["id"]]
    else:
        ids = [payload["id"]]
    for aid in ids:
        ca.extract(aid)
    return "extracted"


def _act_wp(status):
    def run(rule, payload):
        try:
            m = ca.save_to_wp(payload["id"], status)
        except Exception as e:
            note_publish_error(payload["id"], str(e))
            raise
        return f"{status}: {m['article']['title'][:60]}"
    return run


def _act_approve(rule, payload):
    m = ca.set_status(payload["id"], "approved", f"Approved by rule '{rule['name']}'", "ok")
    automation.fire("article_approved", ca.event_payload(m))
    return "approved"


def _act_notify(rule, payload):
    return f"notification: {payload.get('title', '')[:80]}"


for _name, _fn in (("fetch", _act_fetch), ("generate", _act_generate), ("extract", _act_extract), ("publish", _act_wp("publish")),
                   ("draft", _act_wp("draft")), ("approve", _act_approve), ("notify", _act_notify)):
    automation.register(_name, _fn)
automation.start_scheduler()


def _ctx_rule(rid: str) -> dict:
    rule = next((r for r in automation.load_rules() if r["id"] == rid), None)
    site = ctx_site()
    if not rule or (site and rule.get("website_id") not in ("", None, site["id"])):
        abort(404)
    return rule


@server.get("/api/rules")
def rules():
    """The selected website's rules plus the shared ones (website_id empty, e.g. scanning sources)."""
    site = ctx_site()
    items = [r for r in automation.load_rules() if site is None or r.get("website_id") in ("", None, site["id"])]
    return jsonify(items=items, triggers=automation.TRIGGERS, actions=automation.ACTIONS)


@server.post("/api/rules")
def post_rule():
    d, site = request.json or {}, ctx_site()
    if d.get("id"):
        _ctx_rule(d["id"])
    r = automation.upsert_rule(d, site["id"] if site else "")
    activity.log("Automation rule saved", "Automation", r["name"])
    return jsonify(r)


@server.delete("/api/rules/<rid>")
def del_rule(rid):
    _ctx_rule(rid)
    automation.delete_rule(rid)
    activity.log("Automation rule deleted", "Automation", rid)
    return jsonify(ok=True)


@server.post("/api/rules/<rid>/run")
def run_rule(rid):
    rule = _ctx_rule(rid)
    automation._run(rule, {})
    return jsonify(ok=True)


# ---------------------------------------------------------------- activity logs

@server.get("/api/logs")
def logs():
    days, site = int(request.args.get("days", 7)), ctx_site()
    return jsonify(items=activity.read(days, website_id=site["id"] if site else "",
                                       default_id=(websites.default() or {}).get("id", "")))


@server.get("/api/logs/export")
def logs_export():
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    site = ctx_site()
    names = {x["id"]: x["name"] for x in websites.load()}
    w.writerow(["time", "website", "user", "action", "module", "details", "status"])
    for e in activity.read(int(request.args.get("days", 30)), website_id=site["id"] if site else "",
                           default_id=(websites.default() or {}).get("id", "")):
        w.writerow([e["t"], names.get(e.get("website_id"), ""), e["user"], e["action"], e["module"], e["details"], e["status"]])
    return server.response_class("﻿" + buf.getvalue(), mimetype="text/csv",  # BOM: Excel la UTF-8 (Marathi) samajte
                                 headers={"Content-Disposition": "attachment; filename=activity-logs.csv"})


@server.post("/api/logs/cleanup")
def logs_cleanup():
    n = activity.cleanup(int(cfg.load_settings()["app"].get("log_keep_days", 30)))
    return jsonify(removed=n)


# ---------------------------------------------------------------- SEO page

@server.get("/api/seo/overview")
def seo_overview():
    items = [m for m in ctx_articles() if m.get("article")]
    scored = [(m, ca.seo_score(m)) for m in items]
    checks = {}
    for _, s in scored:
        for c in s["checks"]:
            checks.setdefault(c["label"].split(" (")[0], [0, 0])
            checks[c["label"].split(" (")[0]][0] += c["ok"]
            checks[c["label"].split(" (")[0]][1] += 1
    kws = {}
    for m, _ in scored:
        for k in [m["article"].get("focus_keyword", "")] + m["article"].get("tags", []):
            if k:
                kws[k] = kws.get(k, 0) + 1
    latest = scored[0][0]["article"] if scored else None
    return jsonify(total=len(items), optimized=sum(1 for _, s in scored if s["score"] >= 80),
                   avg=round(sum(s["score"] for _, s in scored) / len(scored)) if scored else 0,
                   avg_words=round(sum(s["words"] for _, s in scored) / len(scored)) if scored else 0,
                   checks=[{"label": k, "ok": v[0], "total": v[1]} for k, v in checks.items()],
                   keywords=sorted(kws, key=kws.get, reverse=True)[:14],
                   sample={"title": latest["title"], "excerpt": latest["excerpt"], "slug": latest["slug"],
                           "source": scored[0][0]["source"].get("source", ""), "keyword": latest.get("focus_keyword", "")} if latest else None)


@server.post("/api/seo/preview")
def seo_preview():
    """Preview the selected website's SEO title / description with unsaved changes (nothing is written)."""
    d, site = request.json, ctx_site()
    a = d.get("sample") or {}
    base = site or websites.default() or {}
    draft = dict(base, settings={**(base.get("settings") or {}), "seo": {**cfg.load_settings(base)["seo"], **(d.get("seo") or {})}})
    return jsonify(title=ca.seo_title(a, a.get("source", ""), draft) or a.get("title", ""),
                   description=ca.seo_description(a, draft) or a.get("excerpt", ""))


# ---------------------------------------------------------------- export

@server.get("/api/export/articles")
def export_articles():
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    names = {x["id"]: x["name"] for x in websites.load()}
    w.writerow(["id", "website", "status", "title", "source", "category", "created", "published_at", "url", "seo"])
    for m in ctx_articles():
        a = m.get("article") or {}
        w.writerow([m["id"], names.get(site_id_of(m), ""), m["status"], a.get("title") or m["source"]["title"], m["source"].get("source"),
                    ",".join(a.get("categories", [])), m["created"], m.get("published_at", ""), m.get("url", ""),
                    ca.seo_score(m)["score"] if a else ""])
    return server.response_class("﻿" + buf.getvalue(), mimetype="text/csv",  # BOM: Excel la UTF-8 (Marathi) samajte
                                 headers={"Content-Disposition": "attachment; filename=articles.csv"})


@server.get("/api/export/backup")
def export_backup():
    import io
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in list(ca.CA_DIR.rglob("*")) + [f for f in (cfg.SETTINGS_FILE, cfg.TEMPLATES_FILE, ca.sources.SOURCES_FILE, automation.RULES_FILE, websites.FILE, websites.HIDDEN_FILE) if f.exists()]:
            if p.is_file():
                z.write(p, p.relative_to(ca.BASE))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name=f"currentflow-backup-{date.today()}.zip")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("waitress").setLevel(logging.WARNING)
    port = int(os.environ.get("PORT", 5050))
    try:
        activity.cleanup(int(cfg.load_settings()["app"].get("log_keep_days", 30)))
    except Exception:
        pass
    if "--no-browser" not in sys.argv:
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    print(f"CurrentFlow AI dashboard: http://localhost:{port}   (press Ctrl+C to stop)")
    try:
        from waitress import serve
        serve(server, host="127.0.0.1", port=port, threads=12)
    except ImportError:  # fallback if waitress is not installed
        server.run(host="127.0.0.1", port=port, debug=False, threaded=True)
