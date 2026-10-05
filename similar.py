"""
Find the same news story reported by several sources, so it is written once using all of them.

Titles are compared by their distinctive words (TF-IDF cosine). Only titles from different sources,
published within a few days of each other, are grouped. Daily digest posts ("News In Shorts",
"Headlines of the Day") cover many stories at once and are never grouped.
"""

import math
import re
from collections import Counter
from datetime import date

THRESHOLD = 0.40   # tested on real scans: above this, pairs were the same story; below it, mixed
MAX_DAYS = 3
MAX_GROUP = 6
DIGEST = re.compile(r"news in shorts|headlines of the day|daily current affairs|current affairs (quiz|today)|daily quiz|"
                    r"weekly|monthly|editorial analysis|daily news analysis", re.I)
STOP = set("""a an the of in on at to for and or with by from as is are was were be been its it this that these those into over
under about after before new india india's indian govt government launch launches launched announce announces announced
say says said day week first two three year years via amid during up out more most than his her their our your who what when
where why how current affairs news upsc ias pib update updates key highlights explained daily""".split())
# when several sources report the same story, the official one leads (its facts win in the article)
LEAD_ORDER = ("pib", "air news", "dd news")

_cache: dict = {}


def _tokens(title: str) -> list[str]:
    out = []
    for w in re.findall(r"[a-z0-9]+|[ऀ-ॿ]+", title.lower().replace("’", "'")):
        if w in STOP or (len(w) < 3 and not w.isdigit()):
            continue
        out.append(w[:-1] if w.endswith("s") and len(w) > 4 else w)
    return out


def _days_apart(a: str, b: str) -> int:
    try:
        return abs((date.fromisoformat(a[:10]) - date.fromisoformat(b[:10])).days)
    except (ValueError, TypeError):
        return 0 if not a or not b else 99


def _lead_rank(item: dict) -> tuple:
    name = (item.get("source") or "").lower()
    official = next((i for i, k in enumerate(LEAD_ORDER) if name.startswith(k)), len(LEAD_ORDER))
    return official, -len(item.get("title") or "")


def groups(items: list[dict]) -> dict[str, list[dict]]:
    """lead url -> the group's items (lead first). Only stories found on 2+ sources are returned."""
    key = (len(items), tuple(i["url"] for i in items[:5]), tuple(i["url"] for i in items[-5:]))
    if _cache.get("key") == key:
        return _cache["groups"]
    docs = [_tokens(i.get("title", "")) for i in items]
    df = Counter(w for d in docs for w in set(d))
    n = len(docs) or 1
    vecs = []
    for d in docs:
        v = {w: (1 + math.log(c)) * math.log(n / df[w]) for w, c in Counter(d).items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1
        vecs.append({w: x / norm for w, x in v.items()})
    digest = [bool(DIGEST.search(i.get("title", ""))) for i in items]

    parent = list(range(len(items)))
    size = [1] * len(items)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    pairs = []
    for i in range(len(items)):
        if digest[i] or not vecs[i]:
            continue
        for j in range(i + 1, len(items)):
            if digest[j] or items[i].get("source") == items[j].get("source") or _days_apart(items[i].get("date", ""), items[j].get("date", "")) > MAX_DAYS:
                continue
            score = sum(x * vecs[j].get(w, 0) for w, x in vecs[i].items())
            if score >= THRESHOLD:
                pairs.append((score, i, j))
    for _, i, j in sorted(pairs, reverse=True):   # strongest matches first, so a cap keeps the best members
        a, b = find(i), find(j)
        if a != b and size[a] + size[b] <= MAX_GROUP:
            parent[b] = a
            size[a] += size[b]

    members: dict[int, list[dict]] = {}
    for i, it in enumerate(items):
        members.setdefault(find(i), []).append(it)
    out = {}
    for group in members.values():
        if len(group) < 2:
            continue
        group = sorted(group, key=_lead_rank)
        out[group[0]["url"]] = group
    _cache.update(key=key, groups=out)
    return out


def group_of(url: str, items: list[dict]) -> list[dict]:
    """All items reporting the same story as `url` (lead first), or [] if only one source has it."""
    for group in groups(items).values():
        if any(i["url"] == url for i in group):
            return group
    return []
