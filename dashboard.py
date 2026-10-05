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
from flask import Flask, abort, jsonify, render_template, request, send_file

import logging
import re
from urllib.parse import urlparse

import activity
import automation
import ca
import settings as cfg
import similar

log = logging.getLogger("currentflow")
AID_RE = re.compile(r"^\d{8}-\d{6}-[a-f0-9]{4}$")
SID_RE = re.compile(r"^[a-f0-9]{8}$")

server = Flask(__name__)
server.config["TEMPLATES_AUTO_RELOAD"] = True
server.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
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


def approved_at(m: dict) -> str:
    """When the article was last approved (by a reviewer or an automation rule), taken from its log."""
    return next((e["t"] for e in reversed(m.get("log", [])) if e.get("msg", "").startswith("Approved by")), "")


def summary(m: dict) -> dict:
    a = m.get("article") or {}
    seo = ca.seo_score(m) if a else {"score": 0, "words": 0, "reading_min": 0, "checks": []}
    return {
        "id": m["id"], "status": m["status"], "step": m.get("step", ""),
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
    items = ca.all_articles()
    titles = ca.load_titles()
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    srcs = ca.sources.load_sources()
    return jsonify(
        wp_ready=ca.wp_ready(), wp_url=ca.app.WP_URL, today=today, counts=counts(items),
        sources_total=len(srcs), sources_active=sum(1 for s in srcs if s.get("enabled", True)),
        sources_errors=sum(1 for s in srcs if s.get("enabled", True) and titles.get("stats", {}).get(s["id"], {}).get("error")),
        titles_total=len(titles["items"]), titles_today=sum(1 for t in titles["items"] if t.get("date") == today),
        titles_yesterday=sum(1 for t in titles["items"] if t.get("date") == yesterday),
        fetched_at=titles.get("fetched_at"),
        published_today=sum(1 for m in items if (m.get("published_at") or "").startswith(today)),
        published_yesterday=sum(1 for m in items if (m.get("published_at") or "").startswith(yesterday)),
        storage_bytes=ca.storage_bytes(), writers=cfg.load_settings().get("writers", 2),
        working_now=worker.active, user_name=cfg.load_settings()["app"].get("user_name", "Sachin"),
        claude_plan=(_cache.get("claude") or (0, {}))[1].get("plan", ""),
    )


@server.get("/api/notifications")
def notifications():
    events = []
    for m in ca.all_articles()[:60]:
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
    used = ca.used_urls()
    groups = similar.groups(data["items"]) if cfg.load_settings()["app"].get("combine_sources", True) else {}
    lead_of = {i["url"]: lead for lead, g in groups.items() for i in g}
    for it in data["items"]:
        it["article_id"] = used.get(it["url"])
        lead = lead_of.get(it["url"])
        if lead:   # same story on several sources: Discover shows the lead row with the others listed under it
            it["group"] = lead
            it["also"] = [{"source": o["source"], "title": o["title"], "url": o["url"], "date": o.get("date", "")} for o in groups[lead] if o["url"] != it["url"]]
            # already written from any of its sources -> the whole story counts as done (no duplicate article)
            it["article_id"] = it["article_id"] or next((used[o["url"]] for o in groups[lead] if o["url"] in used), None)
    return jsonify(data)


def do_scan(user: str = "You") -> dict:
    before = {i["url"] for i in ca.load_titles()["items"]}
    data = ca.refresh_titles()
    new = [i for i in data["items"] if i["url"] not in before]
    activity.log("Scanned sources", "Sources", f"{len(data['items'])} titles, {len(new)} new, {len(data['errors'])} errors",
                 "failed" if data["errors"] and not data["items"] else "success", user=user)
    used = ca.used_urls()
    for it in new:
        if it["url"] not in used:
            automation.fire("new_article", it)
    return data


@server.post("/api/titles/refresh")
def refresh_titles():
    do_scan()
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


def select_items(items: list[dict], user: str = "You") -> list[str]:
    with _select_lock:
        all_titles = ca.load_titles()["items"]
        used = ca.used_urls()
        known = {i["url"]: i for i in all_titles}
        combine = cfg.load_settings()["app"].get("combine_sources", True)
        ids = []
        for item in items:
            if item.get("url") not in known and item.get("url") not in used:
                continue  # ignore urls that did not come from a scan
            item = known.get(item["url"], item)
            if item["url"] in used:
                ids.append(used[item["url"]])
                continue
            # the same story on other sources (not already written) is combined into this article
            group = similar.group_of(item["url"], all_titles) if combine else []
            done = next((used[g["url"]] for g in group if g["url"] in used), None)
            if done:   # this story was already written from another source
                ids.append(done)
                continue
            if group and item["url"] != group[0]["url"]:
                item = group[0]   # the official / lead source becomes the main one
            related = [g for g in group if g["url"] != item["url"]]
            m = ca.create_selection(item, related)
            for u in [item["url"]] + [r["url"] for r in related]:
                used[u] = m["id"]
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
    ids = select_items(request.json.get("items", []))
    if request.json.get("process"):
        for aid in ids:
            if ca.load(aid)["status"] not in ca.WORKING:
                ca.set_status(aid, "queued", "Queued for Claude AI", step="")
                worker.add(aid)
    return jsonify(ids=ids)


# ---------------------------------------------------------------- articles

@server.get("/api/articles")
def articles():
    items = ca.all_articles()
    return jsonify(items=[summary(m) for m in items], counts=counts(items))


@server.get("/api/articles/<aid>")
def article(aid):
    safe_aid(aid)
    try:
        m = ca.load(aid)
    except FileNotFoundError:
        abort(404)
    return jsonify(summary(m) | {"article": m.get("article"), "source_text": m.get("source_text", ""),
                                 "related": m.get("related", []), "related_texts": m.get("related_texts", []),
                                 "source_image": m.get("source_image", ""), "log": m.get("log", []),
                                 "seo_detail": ca.seo_score(m), "template_id": m.get("template_id")})


@server.post("/api/articles/<aid>/edit")
def edit(aid):
    safe_aid(aid)
    m = ca.load(aid)
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
    safe_aid(aid)
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
        try:
            m = ca.load(aid)
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
                if not ca.wp_ready():
                    raise RuntimeError("WordPress is not connected")
                if action == "schedule":
                    ca.save_to_wp(aid, "future", d.get("when"))
                else:
                    ca.save_to_wp(aid, "publish" if action == "publish" else "draft")
            elif action == "delete":
                worker.remove(aid)
                shutil.rmtree(ca.CA_DIR / aid)
                activity.log("Article removed", "Articles", (m.get("article") or m["source"])["title"], article_id=aid)
            else:
                raise RuntimeError(f"Unknown action {action}")
            done.append(aid)
        except Exception as e:
            failed.append({"id": aid, "error": str(e)[:300]})
            if action in ("publish", "draft", "schedule"):
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
    t = ca.load_titles()
    return jsonify(items=[_source_view(s, t.get("stats", {}), t["items"]) for s in ca.sources.load_sources()],
                   categories=ca.sources.CATEGORIES)


@server.post("/api/sources/detect")
def detect_source():
    try:
        return jsonify(ca.sources.detect(request.json["url"]))
    except Exception as e:
        return error(str(e)[:300])


@server.post("/api/sources")
def add_source():
    d = request.json
    if not d.get("name") or not d.get("url"):
        return error("Source name and website URL are required")
    try:
        det = d.get("detected") or ca.sources.detect(d["url"])
    except Exception as e:
        return error(str(e)[:300])
    src = ca.sources.add_source(d["name"], det["kind"], det["config"], site=d["url"],
                                category=d.get("category", "General"), description=d.get("description", ""),
                                frequency=d.get("frequency", "manual"), section=d.get("section", ""))
    threading.Thread(target=ca.refresh_one_source, args=(src,), daemon=True).start()
    activity.log("New source added", "Sources", src["name"])
    return jsonify(src)


@server.patch("/api/sources/<sid>")
def update_source(sid):
    if not SID_RE.match(sid or ""):
        abort(404)
    d = dict(request.json)
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
        return jsonify(ca.sources.update_source(sid, **d))
    except KeyError:
        abort(404)


@server.delete("/api/sources/<sid>")
def delete_source(sid):
    if not SID_RE.match(sid or ""):
        abort(404)
    name = next((s["name"] for s in ca.sources.load_sources() if s["id"] == sid), sid)
    ca.sources.remove_source(sid)
    activity.log("Source removed", "Sources", name)
    return jsonify(ok=True)


@server.post("/api/sources/<sid>/scan")
def scan_source(sid):
    if not SID_RE.match(sid or ""):
        abort(404)
    src = next((s for s in ca.sources.load_sources() if s["id"] == sid), None)
    if not src:
        abort(404)
    data = ca.refresh_one_source(src)
    return jsonify(stats=data["stats"].get(sid, {}), count=data["stats"].get(sid, {}).get("count", 0))


# ---------------------------------------------------------------- settings / templates

@server.get("/api/settings")
def get_settings():
    return jsonify(cfg.load_settings())


@server.post("/api/settings")
def post_settings():
    out = cfg.save_settings(request.json or {})
    activity.log("Settings saved", "Settings", ", ".join((request.json or {}).keys()))
    return jsonify(out)


@server.post("/api/settings/reset")
def reset_settings():
    if cfg.SETTINGS_FILE.exists():
        cfg.SETTINGS_FILE.unlink()
    activity.log("Settings reset to defaults", "Settings")
    return jsonify(cfg.load_settings())


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
    return jsonify(items=cfg.load_templates())


@server.post("/api/templates")
def post_template():
    return jsonify(cfg.upsert_template(request.json or {}))


@server.delete("/api/templates/<tid>")
def delete_template(tid):
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
    meta = {"id": "test", "source": {k: item.get(k, "") for k in ("title", "url", "source", "date", "category")}}
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
    items = [m for m in ca.all_articles() if m.get("article")]
    month = date.today().strftime("%Y-%m")
    scores = [ca.seo_score(m)["score"] for m in items]
    secs = [m["seconds"] for m in items if m.get("seconds")]
    return jsonify(generated_month=sum(1 for m in items if m["created"].startswith(month)), generated_total=len(items),
                   avg_seo=round(sum(scores) / len(scores)) if scores else 0,
                   avg_seconds=round(sum(secs) / len(secs)) if secs else 0,
                   sample=[{"title": t["title"], "url": t["url"], "source": t["source"], "date": t.get("date", ""),
                            "category": t.get("category", "")} for t in ca.load_titles()["items"][:40]])


# ---------------------------------------------------------------- WordPress

@server.get("/api/wordpress")
def wordpress():
    info = cached("wp_info", 120, ca.wp_info)
    return jsonify(info | {"user_login": ca.app.WP_USER, "has_password": bool(ca.app.WP_APP_PASSWORD)})


@server.get("/api/wordpress/lists")
def wordpress_lists():
    return jsonify(cached("wp_lists", 600, ca.wp_lists))


@server.post("/api/wordpress/connect")
def wp_connect():
    d = request.json
    url = (d.get("url") or "").strip().rstrip("/")
    user = (d.get("user") or "").strip()
    password = (d.get("password") or "").strip() or ca.app.WP_APP_PASSWORD
    if not (url and user and password):
        return error("Site URL, username and application password are all required")
    try:
        r = requests.get(f"{url}/wp-json/wp/v2/users/me", auth=(user, password), timeout=30,
                         headers={"User-Agent": "wp-article-automation/1.0"})
    except requests.RequestException as e:
        return error(f"Could not reach the site: {e}"[:300])
    if r.status_code in (401, 403):
        return error("WordPress rejected the login. Check the username and application password.")
    if r.status_code == 404 or "json" not in r.headers.get("content-type", ""):
        return error("WordPress REST API was not found at this URL.")
    if not r.ok:
        return error(f"WordPress returned HTTP {r.status_code}")
    if not ENV_FILE.exists():
        ENV_FILE.write_text("")
    for key, value in (("WP_URL", url), ("WP_USER", user), ("WP_APP_PASSWORD", password)):
        set_key(str(ENV_FILE), key, value, quote_mode="never")
    ca.app.WP_URL, ca.app.WP_USER, ca.app.WP_APP_PASSWORD = url, user, password
    ca._catalog_cache.clear()
    _cache.clear()
    activity.log("WordPress connected", "WordPress", url)
    return jsonify(ok=True, name=r.json().get("name", user), url=url)


@server.post("/api/wordpress/test")
def wp_test():
    _cache.pop("wp_info", None)
    info = ca.wp_info()
    if not info.get("connected"):
        return error("WordPress is not configured")
    if info.get("error"):
        return error(info["error"])
    return jsonify(info)


# ---------------------------------------------------------------- Claude

@server.get("/api/claude/status")
def claude_status():
    def check():
        try:
            out = subprocess.run([ca.app.claude_bin(), "auth", "status"], capture_output=True, text=True,
                                 encoding="utf-8", timeout=30, env=ca.app.claude_env())
            info = json.loads(out.stdout)
            return {"installed": True, "logged_in": info.get("loggedIn", False), "plan": info.get("subscriptionType", "")}
        except FileNotFoundError:
            return {"installed": False, "logged_in": False}
        except Exception as e:
            return {"installed": True, "logged_in": False, "error": str(e)[:200]}
    if request.args.get("fresh"):
        _cache.pop("claude", None)
    return jsonify(cached("claude", 300, check))


# ---------------------------------------------------------------- automation rules

def _act_fetch(rule, payload):
    data = do_scan(user="System")
    return f"fetched {len(data['items'])} titles"


def _act_generate(rule, payload):
    if not payload.get("url"):
        raise RuntimeError("no article in event")
    ids = select_items([payload], user="System")
    for aid in ids:
        if ca.load(aid)["status"] not in ca.WORKING and not ca.load(aid).get("article"):
            ca.set_status(aid, "queued", f"Queued by rule '{rule['name']}'", step="")
            worker.add(aid)
    return f"queued '{payload.get('title', '')[:60]}'"


def _act_extract(rule, payload):
    ids = select_items([payload], user="System") if payload.get("url") else [payload["id"]]
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


@server.get("/api/rules")
def rules():
    return jsonify(items=automation.load_rules(), triggers=automation.TRIGGERS, actions=automation.ACTIONS)


@server.post("/api/rules")
def post_rule():
    r = automation.upsert_rule(request.json or {})
    activity.log("Automation rule saved", "Automation", r["name"])
    return jsonify(r)


@server.delete("/api/rules/<rid>")
def del_rule(rid):
    automation.delete_rule(rid)
    activity.log("Automation rule deleted", "Automation", rid)
    return jsonify(ok=True)


@server.post("/api/rules/<rid>/run")
def run_rule(rid):
    rule = next((r for r in automation.load_rules() if r["id"] == rid), None)
    if not rule:
        abort(404)
    automation._run(rule, {})
    return jsonify(ok=True)


# ---------------------------------------------------------------- activity logs

@server.get("/api/logs")
def logs():
    days = int(request.args.get("days", 7))
    return jsonify(items=activity.read(days))


@server.get("/api/logs/export")
def logs_export():
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["time", "user", "action", "module", "details", "status"])
    for e in activity.read(int(request.args.get("days", 30))):
        w.writerow([e["t"], e["user"], e["action"], e["module"], e["details"], e["status"]])
    return server.response_class("﻿" + buf.getvalue(), mimetype="text/csv",  # BOM: Excel la UTF-8 (Marathi) samajte
                                 headers={"Content-Disposition": "attachment; filename=activity-logs.csv"})


@server.post("/api/logs/cleanup")
def logs_cleanup():
    n = activity.cleanup(int(cfg.load_settings()["app"].get("log_keep_days", 30)))
    return jsonify(removed=n)


# ---------------------------------------------------------------- SEO page

@server.get("/api/seo/overview")
def seo_overview():
    items = [m for m in ca.all_articles() if m.get("article")]
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
    d = request.json
    a = d.get("sample") or {}
    saved = cfg.load_settings()
    cfg.save_settings({"seo": d.get("seo", {})})
    try:
        return jsonify(title=ca.seo_title(a, a.get("source", "")) or a.get("title", ""), description=ca.seo_description(a) or a.get("excerpt", ""))
    finally:
        if not d.get("persist"):
            cfg.SETTINGS_FILE.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- export

@server.get("/api/export/articles")
def export_articles():
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "status", "title", "source", "category", "created", "published_at", "url", "seo"])
    for m in ca.all_articles():
        a = m.get("article") or {}
        w.writerow([m["id"], m["status"], a.get("title") or m["source"]["title"], m["source"].get("source"),
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
        for p in list(ca.CA_DIR.rglob("*")) + [f for f in (cfg.SETTINGS_FILE, cfg.TEMPLATES_FILE, ca.sources.SOURCES_FILE, automation.RULES_FILE) if f.exists()]:
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
