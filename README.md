# CurrentFlow AI — Automate Current Affairs (mpscsuccess.com)

Local dashboard that scans news sources, writes Marathi current-affairs articles with Claude Code
(your Claude subscription — no API key), lets you review them, and publishes to WordPress.

## Start
Double-click `start.command`, or in Terminal:

    .venv/bin/python dashboard.py

Then open http://localhost:5050

Requirements: Python 3.11+, Claude Code installed and logged in (`claude auth login`).

## Workflow
Government Sources → Discover Articles → Selected Articles (extract) → Processing Queue (Claude) →
Review Center (approve) → WordPress (publish / schedule) → Published Articles

Nothing is published without a human clicking Publish, unless you create an Automation Rule that does so.

## Files
- `dashboard.py` Flask app + JSON APIs · `ca.py` pipeline · `sources.py` source readers · `automation.py` rules engine
- `settings.json`, `templates.json`, `sources.json`, `rules.json` — editable from the UI
- `ca_articles/` every article (meta.json + featured image) · `ca_cache/` scan cache + activity log
- `.env` WordPress URL / user / application password (never share)

## Backup
Settings → Data & Backup → Full backup (ZIP).
