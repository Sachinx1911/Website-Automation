"""
Automation rules (rules.json) and the engine that runs them.

Triggers
    schedule          every N minutes (config: minutes) or daily at HH:MM (config: time)
    new_article       fired after a scan for every new title (conditions: sources, category, keywords)
    article_ready     fired when Claude finishes an article
    article_approved  fired when the reviewer approves (conditions: min_seo)
    article_published fired after publishing
    processing_failed fired when extraction / writing fails

Actions
    fetch       scan all sources
    generate    select + extract + queue the article for Claude
    extract     only extract source content
    publish     publish to WordPress        draft      send to WordPress as draft
    approve     mark approved               notify     in-app notification (activity log)
"""

import json
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import activity

RULES_FILE = Path(__file__).parent / "rules.json"
TRIGGERS = {
    "schedule": "Schedule", "new_article": "New Article Added", "article_ready": "Article Ready for Review",
    "article_approved": "Article Approved", "article_published": "Article Published", "processing_failed": "Processing Failed",
}
ACTIONS = {
    "fetch": "Fetch Articles", "generate": "Generate AI Content", "extract": "Extract Source Content",
    "publish": "Publish to WordPress", "draft": "Send to WordPress as Draft", "approve": "Approve Article", "notify": "Send Notification",
}
_lock = threading.Lock()
_handlers: dict = {}   # action -> callable(rule, payload) ; registered by dashboard.py
_listeners: list = []


def load_rules() -> list[dict]:
    if not RULES_FILE.exists():
        return []
    return json.loads(RULES_FILE.read_text(encoding="utf-8"))


def save_rules(items: list[dict]) -> None:
    with _lock:
        RULES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def upsert_rule(data: dict) -> dict:
    items = load_rules()
    rule = next((r for r in items if r["id"] == data.get("id")), None)
    if rule is None:
        rule = {"id": uuid.uuid4().hex[:8], "created": datetime.now().isoformat(timespec="seconds"), "runs": 0,
                "last_run": "", "enabled": True}
        items.append(rule)
    for key in ("name", "description", "trigger", "action", "conditions", "config", "enabled"):
        if key in data:
            rule[key] = data[key]
    rule.setdefault("conditions", {})
    rule.setdefault("config", {})
    save_rules(items)
    return rule


def delete_rule(rid: str) -> None:
    save_rules([r for r in load_rules() if r["id"] != rid])


def register(action: str, fn) -> None:
    _handlers[action] = fn


def _matches(rule: dict, payload: dict) -> bool:
    c = rule.get("conditions") or {}
    if c.get("sources") and payload.get("source_id") not in c["sources"] and payload.get("source") not in c["sources"]:
        return False
    if c.get("category") and payload.get("category") != c["category"]:
        return False
    if c.get("keywords"):
        text = (payload.get("title", "") + " " + payload.get("excerpt", "")).lower()
        if not any(k.strip().lower() in text for k in c["keywords"].split(",") if k.strip()):
            return False
    if c.get("min_seo") and (payload.get("seo") or 0) < int(c["min_seo"]):
        return False
    return True


def _run(rule: dict, payload: dict) -> None:
    fn = _handlers.get(rule["action"])
    if not fn:
        return
    try:
        result = fn(rule, payload)
        status = "success"
        details = f"{rule['name']}: {result or ACTIONS.get(rule['action'], rule['action'])}"
    except Exception as e:
        status, details = "failed", f"{rule['name']}: {e}"
    items = load_rules()
    for r in items:
        if r["id"] == rule["id"]:
            r["runs"] = r.get("runs", 0) + 1
            r["last_run"] = datetime.now().isoformat(timespec="seconds")
            r["last_status"] = status
    save_rules(items)
    activity.log("Automation rule ran", "Automation", details[:300], status, user="System", article_id=payload.get("id", ""))


def fire(trigger: str, payload: dict | None = None) -> int:
    """Called by the pipeline when something happens. Returns number of rules executed."""
    payload = payload or {}
    ran = 0
    for rule in load_rules():
        if rule.get("enabled") and rule.get("trigger") == trigger and _matches(rule, payload):
            threading.Thread(target=_run, args=(rule, payload), daemon=True).start()
            ran += 1
    return ran


def _due(rule: dict, now: datetime) -> bool:
    cfg = rule.get("config") or {}
    last = rule.get("last_run")
    if cfg.get("time"):  # daily at HH:MM
        hh, mm = cfg["time"].split(":")
        target = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
        return now >= target and (not last or last[:10] < now.date().isoformat())
    minutes = int(cfg.get("minutes") or 30)
    if not last:
        return True
    return (now - datetime.fromisoformat(last)).total_seconds() >= minutes * 60


def start_scheduler() -> None:
    def loop():
        time.sleep(15)
        while True:
            now = datetime.now()
            for rule in load_rules():
                if rule.get("enabled") and rule.get("trigger") == "schedule" and _due(rule, now):
                    _run(rule, {})
            time.sleep(30)
    threading.Thread(target=loop, daemon=True).start()
