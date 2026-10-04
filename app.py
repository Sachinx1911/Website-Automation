"""
WordPress Marathi article automation (laptop var chalnare).

Kram:
    1. python app.py topics -n 10   -> Claude topics suchvto, topics.txt madhe yetat (nako te delete kara)
    2. python app.py write          -> topics.txt madhil pratyek topic var article lihito (articles/ folder madhe)
    3. images taka                  -> articles/<article>/images/ madhe (IMAGES.txt madhe kay lagel te lihile ahe)
    4. python app.py review         -> pratyek article browser madhe ughdto; vachun Publish / Draft / Skip
    python app.py status            -> sagle articles ani tyanchi sthiti
"""

import argparse
import html
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import webbrowser
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

WP_URL = os.environ.get("WP_URL", "").rstrip("/")
WP_USER = os.environ.get("WP_USER", "")
WP_APP_PASSWORD = os.environ.get("WP_APP_PASSWORD", "")
WP_CATEGORY = os.environ.get("WP_CATEGORY", "").strip()
SITE_NICHE = os.environ.get("SITE_NICHE", "").strip() or (
    "MPSC ani Maharashtra sarkari bharti (Rajyaseva, Combine gat B/C, Talathi, Police bharti): "
    "abhyasakram, exam pattern, pagar, patrata, notes, abhyas strategy ani bharti margadarshan")
MODEL = os.environ.get("CLAUDE_MODEL", "").strip()  # rikama = Claude Code cha default model

TOPICS_FILE = BASE / "topics.txt"
ARTICLES_DIR = BASE / "articles"
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
IMAGE_MARKER = re.compile(r"<!--\s*IMAGE:(\d+)\s*-->")


# ---------------------------------------------------------------- Claude

def claude_env() -> dict:
    """Claude desktop app / dusrya Claude Code session madhun chalavli tar tyache settings kadhun taka."""
    return {k: v for k, v in os.environ.items()
            if not (k.startswith(("CLAUDE_CODE_", "CLAUDE_AGENT_", "ANTHROPIC_"))
                    or k in ("CLAUDECODE", "USE_STAGING_OAUTH", "USE_LOCAL_OAUTH", "CLAUDE_PID"))}


def claude_json(system: str, prompt: str, schema: dict, model: str = "") -> dict:
    """Laptop varil Claude Code (`claude -p`) kadun JSON uttar ghya. API key lagat nahi."""
    cmd = ["claude", "-p", "--output-format", "json", "--json-schema", json.dumps(schema),
           "--system-prompt", system, "--tools", "", "--setting-sources", "",
           "--strict-mcp-config", "--no-session-persistence"]
    if model or MODEL:
        cmd += ["--model", model or MODEL]
    try:
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=1200, env=claude_env())
    except subprocess.TimeoutExpired:
        raise RuntimeError("Claude Code la 20 minitanpeksha jast vel lagla. Punha prayatna kara.")
    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Claude Code chalala nahi: {(proc.stderr or proc.stdout).strip()[:500]}")
    if out.get("is_error"):
        msg = out.get("result", "")
        if "authenticate" in msg.lower() or "login" in msg.lower():
            msg += "\n  -> Terminal madhe `claude auth login` chalva."
        raise RuntimeError(f"Claude Code error: {msg}")
    if out.get("structured_output") is not None:
        return out["structured_output"]
    return json.loads(out["result"])


TOPICS_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Marathi madhe article cha vishay"},
                    "reason": {"type": "string", "description": "Ha vishay ka changla ahe (ek vakya)"},
                },
                "required": ["title", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["topics"],
    "additionalProperties": False,
}

ARTICLE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Akarshak, SEO-friendly Marathi title"},
        "content_html": {
            "type": "string",
            "description": "Purna article HTML madhe (<h2>, <h3>, <p>, <ul>, <li>, <strong>). <h1> nako. "
                           "Image yaychi tithe <!--IMAGE:1-->, <!--IMAGE:2--> ase markers (kramane).",
        },
        "excerpt": {"type": "string", "description": "1-2 vakyancha saransh (meta description)"},
        "tags": {"type": "array", "items": {"type": "string"}, "description": "3-6 Marathi tags"},
        "slug": {"type": "string", "description": "English madhe lowercase-hyphen URL slug"},
        "categories": {"type": "array", "items": {"type": "string"},
                       "description": "Dilelya yadi madhunach 1-3 WordPress categories"},
        "featured_image_idea": {"type": "string", "description": "Featured image madhe kay asave (Marathi)"},
        "images": {
            "type": "array",
            "description": "Article madhil pratyek IMAGE marker sathi ek, kramane (1, 2, ...)",
            "items": {
                "type": "object",
                "properties": {
                    "idea": {"type": "string", "description": "Ya image madhe kay asave (Marathi)"},
                    "alt": {"type": "string", "description": "Image cha Marathi alt text (SEO)"},
                },
                "required": ["idea", "alt"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "content_html", "excerpt", "tags", "slug", "categories", "featured_image_idea", "images"],
    "additionalProperties": False,
}

ARTICLE_SYSTEM = """Tumhi MPSC ani Maharashtra sarkari bharti (Rajyaseva, Combine, Talathi, Police bharti) \
vishayatil anubhavi margadarshak ani Marathi blog lekhak ahat. Vachak he spardha pariksha deNare vidyarthi ahet.

Bhasha ani style:
- Saral, bolchal sarkhi pan shuddha Marathi (Devanagari). Vidyarthyashi thet bola ("tumhi").
- Mahatvache tantrik shabd Marathi sobat kansat English madhe dya, udaharanartha: \
"निवड प्रक्रिया (Selection Process)", "अभ्यासक्रम (Syllabus)".

Rachana (HTML):
- 1500-2000 shabd. <h1> nako; mukhya bhag <h2>, upabhag <h3>.
- Suruvatila 2-3 olinchi prastavana: ha lekh vachun vidyarthyala kay milel.
- Mahiti yadi (<ul>/<ol>) ani tables (<table> with <thead>) madhe dya: exam pattern, guN, pagar, \
abhyasakram, pustak yadi ityadi.
- Shevati "नेहमी विचारले जाणारे प्रश्न (FAQ)" vibhag: 4-6 prashna <h3> madhe ani tyanchi chhoti uttare.
- Tyanantar chhota nishkarsh.
- 2-3 thikani image sathi <!--IMAGE:1-->, <!--IMAGE:2--> markers swatantra olivar theva \
(<p> chya aat nahi). Pratyek marker sathi `images` madhe kay image lagel te sanga \
(infographic, table cha photo, pariksha sambandhit chitra ityadi).

Internal links:
- Dilelya "site varil junya posts" madhun vishayashi sambandhit 2-4 posts chya links lekhat \
naisargikpane dya (<a href="URL">anchor text</a>). Yadit nasleli konatihi URL banvu naka.

Achukta (atishay mahatvache):
- Jagancha akda, arjachya tarkha, pariksha tarkha, fee yasarkhi badalNari mahiti swatah banvu naka. \
Khatri nasel tar "अधिकृत जाहिरात / mahabhumi.gov.in / mpsc.gov.in वर तपासा" ase sanga.
- Saamanya, sthir mahiti (abhyasakram che vishay, kamache swarup, tayari) var bhar dya.

SEO:
- Mukhya keyword title madhe, pahilya parichhedat ani ekhadya <h2> madhe naisargikpane.
- Title madhe Marathi ani garaj asel tar English keyword, udaharanartha \
"Talathi Bharti 2026: अभ्यासक्रम, पात्रता आणि तयारी".
- Slug English madhe (lowercase, hyphens), lahan ani keyword asleli.
- Categories fakt dilelya yadi madhunach nivda."""


# ---------------------------------------------------------------- WordPress

class WordPress:
    def __init__(self):
        if not (WP_URL and WP_USER and WP_APP_PASSWORD):
            sys.exit(".env madhe WP_URL, WP_USER, WP_APP_PASSWORD bhara (.env.example paha)")
        self.api = f"{WP_URL}/wp-json/wp/v2"
        self.session = requests.Session()
        self.session.auth = (WP_USER, WP_APP_PASSWORD)
        self.session.headers["User-Agent"] = "wp-article-automation/1.0"

    def check_auth(self) -> str:
        r = self.session.get(f"{self.api}/users/me", timeout=30)
        r.raise_for_status()
        return r.json()["name"]

    def term_id(self, kind: str, name: str) -> int:
        r = self.session.get(f"{self.api}/{kind}", params={"search": name, "per_page": 100}, timeout=30)
        r.raise_for_status()
        for term in r.json():
            if html.unescape(term["name"]).strip().lower() == name.strip().lower():
                return term["id"]
        r = self.session.post(f"{self.api}/{kind}", json={"name": name}, timeout=30)
        if r.status_code == 400 and r.json().get("code") == "term_exists":
            return r.json()["data"]["term_id"]
        r.raise_for_status()
        return r.json()["id"]

    def upload_image(self, path: Path, alt: str) -> dict:
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        r = self.session.post(
            f"{self.api}/media", data=path.read_bytes(), timeout=120,
            headers={"Content-Type": mime, "Content-Disposition": f'attachment; filename="{path.name}"'})
        r.raise_for_status()
        media = r.json()
        self.session.post(f"{self.api}/media/{media['id']}", json={"alt_text": alt}, timeout=30)
        return media

    def create_post(self, payload: dict) -> dict:
        r = self.session.post(f"{self.api}/posts", json=payload, timeout=60)
        r.raise_for_status()
        return r.json()


def site_catalog() -> tuple[list[str], list[tuple[str, str]]]:
    """Website varil categories ani publish jhalelya posts (title, link). Login lagat nahi."""
    if not WP_URL:
        return [], []
    api = f"{WP_URL}/wp-json/wp/v2"
    headers = {"User-Agent": "wp-article-automation/1.0"}
    try:
        r = requests.get(f"{api}/categories", params={"per_page": 100, "_fields": "name"},
                         headers=headers, timeout=30)
        r.raise_for_status()
        categories = [html.unescape(c["name"]) for c in r.json()
                      if c["name"].lower() not in ("uncategorized", "webstories")]
        posts = []
        for page in range(1, 4):
            r = requests.get(f"{api}/posts", params={"per_page": 100, "page": page, "_fields": "title,link"},
                             headers=headers, timeout=30)
            if r.status_code == 400:  # shevatchi page sampli
                break
            r.raise_for_status()
            posts += [(html.unescape(p["title"]["rendered"]), p["link"]) for p in r.json()]
            if len(r.json()) < 100:
                break
        return categories, posts
    except requests.RequestException as e:
        print(f"(Website varun categories/posts milale nahit: {e})")
        return [], []


# ---------------------------------------------------------------- Articles (local)

class Article:
    def __init__(self, folder: Path):
        self.folder = folder
        self.meta_path = folder / "meta.json"
        self.meta = json.loads(self.meta_path.read_text(encoding="utf-8"))

    @property
    def content(self) -> str:
        # article.html tumhi edit karu shakta; publish kartana hich file vaparli jate
        return (self.folder / "article.html").read_text(encoding="utf-8")

    @property
    def status(self) -> str:
        return self.meta["status"]

    def save(self) -> None:
        self.meta_path.write_text(json.dumps(self.meta, ensure_ascii=False, indent=2), encoding="utf-8")

    def find_image(self, stem: str) -> Path | None:
        for p in sorted((self.folder / "images").iterdir()):
            if p.stem.lower() == stem and p.suffix.lower() in IMAGE_EXTS:
                return p
        return None

    def missing_images(self) -> list[str]:
        missing = [] if self.find_image("featured") else ["featured"]
        for n in sorted({int(m) for m in IMAGE_MARKER.findall(self.content)}):
            if not self.find_image(str(n)):
                missing.append(str(n))
        return missing

    def image_info(self, n: int) -> dict:
        images = self.meta.get("images", [])
        return images[n - 1] if 0 < n <= len(images) else {"idea": "", "alt": self.meta["title"]}

    def write_preview(self) -> Path:
        def figure(match: re.Match) -> str:
            n = int(match.group(1))
            info = self.image_info(n)
            img = self.find_image(str(n))
            if img:
                return f'<figure><img src="images/{img.name}" alt="{html.escape(info["alt"])}"></figure>'
            return (f'<div class="missing">📷 Image {n} nahi — <code>images/{n}.jpg</code> taka<br>'
                    f'<small>{html.escape(info["idea"])}</small></div>')

        featured = self.find_image("featured")
        featured_html = (f'<img class="featured" src="images/{featured.name}">' if featured else
                         f'<div class="missing">📷 Featured image nahi — <code>images/featured.jpg</code> taka<br>'
                         f'<small>{html.escape(self.meta.get("featured_image_idea", ""))}</small></div>')
        page = f"""<!doctype html><html lang="mr"><head><meta charset="utf-8">
<title>{html.escape(self.meta['title'])}</title>
<style>
 body {{ font-family: "Noto Sans Devanagari", "Mukta", sans-serif; max-width: 760px; margin: 40px auto;
        padding: 0 20px; line-height: 1.8; font-size: 18px; color: #222; }}
 .info {{ background: #f3f6fa; padding: 12px 16px; border-radius: 8px; font-size: 14px; }}
 img {{ max-width: 100%; border-radius: 8px; }} figure {{ margin: 24px 0; }}
 table {{ border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 16px; }}
 th, td {{ border: 1px solid #ccc; padding: 8px; text-align: left; }} th {{ background: #f3f6fa; }}
 .missing {{ background: #fff4d6; border: 2px dashed #e0a800; padding: 16px; border-radius: 8px; margin: 24px 0; }}
</style></head><body>
<div class="info"><b>Topic:</b> {html.escape(self.meta['topic'])}<br>
<b>Saransh:</b> {html.escape(self.meta['excerpt'])}<br>
<b>Categories:</b> {html.escape(', '.join(self.meta.get('categories', [])))}<br>
<b>Tags:</b> {html.escape(', '.join(self.meta['tags']))}<br>
<b>Slug:</b> {html.escape(self.meta['slug'])} &nbsp; <b>Sthiti:</b> {self.status}</div>
<h1>{html.escape(self.meta['title'])}</h1>
{featured_html}
{IMAGE_MARKER.sub(figure, self.content)}
</body></html>"""
        path = self.folder / "preview.html"
        path.write_text(page, encoding="utf-8")
        return path


def all_articles() -> list[Article]:
    if not ARTICLES_DIR.exists():
        return []
    return [Article(p) for p in sorted(ARTICLES_DIR.iterdir()) if (p / "meta.json").exists()]


def read_topics() -> list[str]:
    if not TOPICS_FILE.exists():
        return []
    return [l.strip() for l in TOPICS_FILE.read_text(encoding="utf-8").splitlines()
            if l.strip() and not l.strip().startswith("#")]


# ---------------------------------------------------------------- Commands

def cmd_topics(args) -> None:
    niche = args.niche or SITE_NICHE
    _, posts = site_catalog()
    existing = [a.meta["title"] for a in all_articles()] + read_topics() + [t for t, _ in posts]

    prompt = (f"Majhi Marathi website ya vishayavar ahe: {niche}\n\n"
              f"Navin {args.n} blog article vishay suchva. Vidyarthi Google var prataksha shodhtat ase "
              f"vishay asavet (udaharanartha: bharti mahiti, abhyasakram, pagar, notes, tayari strategy, "
              f"vishay-nihay mahatvache mudde). Pratyek vishay Marathi madhe ani garaj asel tar sobat "
              f"English keyword.\n\n"
              "He vishay aadhich jhale ahet, te kiwa tyanchyasarkhe punha suchvu naka:\n"
              + "\n".join(f"- {t}" for t in existing[:400]))
    result = claude_json("Tumhi Marathi content strategist ani SEO tadnya ahat.", prompt, TOPICS_SCHEMA)

    lines = [f"# --- {date.today()} la suchvlele (nako te topics delete kara) ---"]
    for t in result["topics"]:
        lines.append(f"# {t['reason']}")
        lines.append(t["title"])
        print(f"• {t['title']}\n    {t['reason']}")
    with TOPICS_FILE.open("a", encoding="utf-8") as f:
        f.write("\n" + "\n".join(lines) + "\n")
    print(f"\n{len(result['topics'])} topics {TOPICS_FILE.name} madhe add jhale. "
          "Nako te topics delete kara, mag `python app.py write` chalva.")


def cmd_write(args) -> None:
    topics = read_topics()
    if args.limit:
        topics = topics[:args.limit]
    if not topics:
        sys.exit("topics.txt rikami ahe. Aadhi `python app.py topics` chalva kiwa topics swatah liha.")

    categories, posts = site_catalog()
    context = ("Website varil categories:\n" + "\n".join(f"- {c}" for c in categories) +
               "\n\nSite varil junya posts (internal links sathi):\n" +
               "\n".join(f"- {t} | {u}" for t, u in posts[:200]))
    schema = json.loads(json.dumps(ARTICLE_SCHEMA))
    if categories:
        schema["properties"]["categories"]["items"]["enum"] = categories

    ARTICLES_DIR.mkdir(exist_ok=True)
    for i, topic in enumerate(topics, 1):
        print(f"\n[{i}/{len(topics)}] Lihit ahe: {topic}")
        try:
            data = claude_json(ARTICLE_SYSTEM, f"{context}\n\nAjcha lekhacha vishay: {topic}", schema)
        except (RuntimeError, json.JSONDecodeError) as e:
            print(f"  Chuk: {e}")
            continue

        slug = re.sub(r"[^a-z0-9-]+", "-", data["slug"].lower()).strip("-") or "article"
        folder = ARTICLES_DIR / f"{date.today()}-{slug}"
        n = 2
        while folder.exists():
            folder = ARTICLES_DIR / f"{date.today()}-{slug}-{n}"
            n += 1
        (folder / "images").mkdir(parents=True)
        (folder / "article.html").write_text(data.pop("content_html"), encoding="utf-8")

        (folder / "meta.json").write_text(json.dumps(
            {"topic": topic, "status": "written", **data, "slug": slug}, ensure_ascii=False, indent=2),
            encoding="utf-8")
        article = Article(folder)

        needed = [f"featured.jpg  ->  {data['featured_image_idea']}"]
        needed += [f"{k}.jpg  ->  {img['idea']}" for k, img in enumerate(data["images"], 1)]
        (folder / "IMAGES.txt").write_text(
            "Ya images 'images' folder madhe ya navane taka (.jpg / .png / .webp chalel):\n\n"
            + "\n".join(needed) + "\n", encoding="utf-8")
        article.write_preview()

        remove_topic(topic)
        print(f"  Title: {data['title']}\n  Folder: articles/{folder.name}")
        for line in needed:
            print(f"    📷 {line}")


def remove_topic(topic: str) -> None:
    lines = TOPICS_FILE.read_text(encoding="utf-8").splitlines()
    for idx, line in enumerate(lines):
        if line.strip() == topic:
            del lines[idx]
            break
    TOPICS_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_status(args) -> None:
    articles = all_articles()
    pending = read_topics()
    print(f"topics.txt madhe lihayche baki: {len(pending)}\n")
    if not articles:
        print("Ajun ekhi article nahi.")
        return
    for a in articles:
        missing = a.missing_images() if a.status != "published" else []
        note = f"  (images baki: {', '.join(missing)})" if missing else ""
        url = f"  {a.meta.get('url', '')}" if a.status in ("published", "draft") else ""
        print(f"[{a.status:9}] {a.folder.name}{note}{url}\n            {a.meta['title']}")


def publish(wp: WordPress, article: Article, status: str) -> dict:
    meta = article.meta

    def upload(stem: str, alt: str) -> dict | None:
        img = article.find_image(stem)
        if not img:
            return None
        print(f"  Upload: {img.name}")
        return wp.upload_image(img, alt)

    featured = upload("featured", meta["title"])

    def figure(match: re.Match) -> str:
        n = int(match.group(1))
        alt = article.image_info(n)["alt"]
        media = upload(str(n), alt)
        if not media:
            return ""
        return (f'<!-- wp:image {{"id":{media["id"]}}} -->\n<figure class="wp-block-image">'
                f'<img src="{media["source_url"]}" alt="{html.escape(alt)}" class="wp-image-{media["id"]}"/>'
                f"</figure>\n<!-- /wp:image -->")

    payload = {
        "title": meta["title"],
        "content": IMAGE_MARKER.sub(figure, article.content),
        "excerpt": meta["excerpt"],
        "slug": meta["slug"],
        "status": status,
        "tags": [wp.term_id("tags", t) for t in meta["tags"]],
    }
    if featured:
        payload["featured_media"] = featured["id"]
    categories = meta.get("categories") or ([WP_CATEGORY] if WP_CATEGORY else [])
    if categories:
        payload["categories"] = [wp.term_id("categories", c) for c in categories]
    return wp.create_post(payload)


def cmd_review(args) -> None:
    articles = [a for a in all_articles() if a.status == "written"]
    if not articles:
        sys.exit("Review sathi ekhi article nahi. (`python app.py status` paha)")

    wp = WordPress()
    print(f"WordPress login OK: {wp.check_auth()}")
    for i, a in enumerate(articles, 1):
        print(f"\n[{i}/{len(articles)}] {a.meta['title']}\n  Folder: articles/{a.folder.name}")
        webbrowser.open(a.write_preview().as_uri())
        missing = a.missing_images()
        if missing:
            print(f"  ⚠️  Images baki: {', '.join(missing)}  (IMAGES.txt paha)")

        while True:
            choice = input("  [p] Publish  [d] Draft mhanun pathva  [r] Preview punha (edit kelyavar)  "
                           "[s] Skip  [q] Band kara : ").strip().lower()
            if choice == "r":
                webbrowser.open(a.write_preview().as_uri())
                missing = a.missing_images()
                print(f"  Images baki: {', '.join(missing) or 'kahi nahi ✅'}")
                continue
            break

        if choice == "q":
            break
        if choice not in ("p", "d"):
            continue
        if missing and input("  Kahi images nahit. Tari pudhe jaycha? [y/n] : ").strip().lower() != "y":
            continue
        try:
            post = publish(wp, a, "publish" if choice == "p" else "draft")
        except requests.RequestException as e:
            print(f"  Chuk: {e}")
            continue
        a.meta.update(status="published" if choice == "p" else "draft",
                      wp_id=post["id"], url=post["link"])
        a.save()
        print(f"  ✅ {'Publish zala' if choice == 'p' else 'Draft save zala'}: {post['link']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Marathi article automation for WordPress")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("topics", help="Claude kadun navin topics suchva")
    p.add_argument("-n", type=int, default=10, help="Kiti topics (default 10)")
    p.add_argument("--niche", help="Website cha vishay (.env madhil SITE_NICHE aivaji)")
    p.set_defaults(func=cmd_topics)

    p = sub.add_parser("write", help="topics.txt madhil topics var articles liha")
    p.add_argument("--limit", type=int, help="Fakt pahile N topics")
    p.set_defaults(func=cmd_write)

    sub.add_parser("review", help="Articles vacha ani publish kara").set_defaults(func=cmd_review)
    sub.add_parser("status", help="Saglya articles chi sthiti").set_defaults(func=cmd_status)

    args = parser.parse_args()
    if args.cmd in ("topics", "write") and not shutil.which("claude"):
        sys.exit("`claude` command sapadli nahi. Claude Code install ahe ka te tapasa.")
    try:
        args.func(args)
    except RuntimeError as e:
        sys.exit(f"Chuk: {e}")


if __name__ == "__main__":
    main()
