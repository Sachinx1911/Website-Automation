"""Activity log: one JSON line per event in ca_cache/activity.jsonl (used by the Activity Logs page)."""

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path

LOG_FILE = Path(__file__).parent / "ca_cache" / "activity.jsonl"
_lock = threading.Lock()
MODULES = ("Articles", "AI Processing", "Automation", "SEO", "WordPress", "Sources", "System", "Settings")


def log(action: str, module: str, details: str = "", status: str = "success", user: str = "You", article_id: str = "") -> dict:
    event = {"t": datetime.now().isoformat(timespec="seconds"), "user": user, "action": action, "module": module,
             "details": str(details)[:300], "status": status, "article_id": article_id}
    with _lock:
        LOG_FILE.parent.mkdir(exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event


def read(days: int = 7, limit: int = 5000) -> list[dict]:
    if not LOG_FILE.exists():
        return []
    since = (datetime.now() - timedelta(days=days)).isoformat() if days else ""
    out = []
    with LOG_FILE.open(encoding="utf-8") as f:
        for line in f:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if e["t"] >= since:
                out.append(e)
    return out[-limit:][::-1]


def _keep(line: str, since: str) -> bool:
    try:
        return json.loads(line).get("t", "") >= since
    except (json.JSONDecodeError, AttributeError):
        return True


def cleanup(keep_days: int = 30) -> int:
    if not LOG_FILE.exists():
        return 0
    since = (datetime.now() - timedelta(days=keep_days)).isoformat()
    with _lock:
        lines = LOG_FILE.read_text(encoding="utf-8").splitlines()
        kept = [l for l in lines if _keep(l, since)]
        LOG_FILE.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    return len(lines) - len(kept)
