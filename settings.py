"""
Dashboard settings (settings.json) and Claude prompt templates (templates.json).
Both are edited from the web UI.
"""

import json
import uuid
from pathlib import Path

BASE = Path(__file__).parent
SETTINGS_FILE = BASE / "settings.json"
TEMPLATES_FILE = BASE / "templates.json"
INSTRUCTIONS_FILE = BASE / "instructions.md"

DEFAULTS = {
    "model": "",                 # Claude Code model alias ("" = Claude Code default, "opus", "sonnet", "haiku")
    "writers": 2,                # articles written in parallel
    "quick": {                   # appended to every system prompt
        "faq": True, "meta_description": True, "internal_links": True, "highlights": True, "mcq": True,
    },
    "publish": {
        "post_status": "publish",    # publish | draft | future
        "author": None,              # WordPress user id
        "default_category": "",      # always added
        "default_tags": "",          # comma separated, always added
        "featured_image": True,
        "rankmath_meta": True,
        "auto_draft": True,          # send to WordPress as draft right after writing
        "image_source": "source",    # source | none
    },
    "content": {
        "length": "medium",          # short (500-800) | medium (800-1200) | long (1500-2000)
        "source_link": False,        # add "स्रोत" link at the end
        "disclaimer": "",            # appended paragraph (empty = none)
        "language_note": "",         # extra instruction line
    },
    "seo": {
        "title_template": "{title}",
        "description_template": "{excerpt}",
        "title_limit": 60, "description_limit": 160,
        "auto_title": True, "auto_description": True, "add_source_name": False, "add_year": False,
        "default_keywords": "",      # comma separated, appended as tags
        "slug_max": 70, "slug_suffix": "",
        "alt_template": "{title}",
        "internal_links": True, "max_internal_links": 3,
    },
    "app": {
        "auto_extract": True,        # extract right after selecting
        "duplicate_check": True,     # skip titles already used
        "log_keep_days": 30,
        "dashboard_name": "CurrentFlow AI",
        "user_name": "Sachin",
        "theme": "light",
    },
}

DEFAULT_USER_PROMPT = """Generate a new Marathi current-affairs article from the information below.

Title: {title}
Source: {source}
Category: {category}
Date: {date}
Original URL: {url}

Source content:
{extracted_content}

Follow the structure and guidelines from the system instructions. Write an SEO-friendly article with proper headings, key highlights, exam-oriented facts, MCQs and an FAQ section."""


def _deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = _deep_merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        return _deep_merge(DEFAULTS, json.loads(SETTINGS_FILE.read_text(encoding="utf-8")))
    return json.loads(json.dumps(DEFAULTS))


def save_settings(changes: dict) -> dict:
    merged = _deep_merge(load_settings(), changes)
    SETTINGS_FILE.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return merged


# ---------------------------------------------------------------- templates

def _seed_templates() -> list[dict]:
    system = INSTRUCTIONS_FILE.read_text(encoding="utf-8") if INSTRUCTIONS_FILE.exists() else ""
    return [{
        "id": uuid.uuid4().hex[:8], "name": "Current Affairs – Standard", "default": True,
        "description": "Standard template for MPSC current-affairs articles",
        "system": system, "user": DEFAULT_USER_PROMPT, "model": "",
    }]


def load_templates() -> list[dict]:
    if not TEMPLATES_FILE.exists():
        save_templates(_seed_templates())
    return json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))


def save_templates(items: list[dict]) -> None:
    if items and not any(t.get("default") for t in items):
        items[0]["default"] = True
    TEMPLATES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def default_template() -> dict:
    items = load_templates()
    return next((t for t in items if t.get("default")), items[0])


def get_template(tid: str | None) -> dict:
    if tid:
        for t in load_templates():
            if t["id"] == tid:
                return t
    return default_template()


def upsert_template(data: dict) -> dict:
    items = load_templates()
    tid = data.get("id")
    tpl = next((t for t in items if t["id"] == tid), None)
    if tpl is None:
        tpl = {"id": uuid.uuid4().hex[:8], "default": not items}
        items.append(tpl)
    for key in ("name", "description", "system", "user", "model"):
        if key in data:
            tpl[key] = data[key]
    if data.get("default"):
        for t in items:
            t["default"] = t is tpl
    save_templates(items)
    return tpl


def delete_template(tid: str) -> None:
    items = [t for t in load_templates() if t["id"] != tid]
    if not items:
        raise ValueError("You need at least one template")
    save_templates(items)


def render_user_prompt(template: str, **vars) -> str:
    out = template
    for k, v in vars.items():
        out = out.replace("{" + k + "}", str(v or ""))
    return out
