#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Update existing ddex-map.json with URLs scraped from official DDEX documentation sites.

- Depth-limited BFS crawl (MAX_DEPTH=5, configurable)
- Keeps existing working URLs
- Replaces dead (404/403/timeouts) with empty string
- Only updates placeholders (https://ddex.net/docs/...) using fresh crawl results

Usage:
  python scrape_ddex_update.py --map assets/ddex-map.json --out assets/ddex-map.updated.json
"""

import json
import time
import re
import urllib.parse
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from collections import deque

USER_AGENT = "MusicTechLab-DDexScraper/1.2"

SEEDS = [
    "https://ern.ddex.net/",
    "https://service.ddex.net/dd/ERN38/",
    "https://ddex.net/standards/"
]

ALLOWED_DOMAINS = ("ern.ddex.net", "service.ddex.net", "ddex.net")

MAX_PAGES   = 1000     # hard cap for safety
MAX_DEPTH   = 5        # <— crawl recursively up to this depth
SLEEP_BETWEEN = 0.5
CHECK_TIMEOUT = 8

DOMAIN_PRIORITY = {"ern.ddex.net": 3, "service.ddex.net": 2, "ddex.net": 1}

# ───────────────────────────────────────────────────────────────
def same_domain(url: str) -> bool:
    try:
        return any(urllib.parse.urlparse(url).netloc.lower().endswith(d) for d in ALLOWED_DOMAINS)
    except Exception:
        return False

def normalize_url(base: str, href: str) -> str:
    try:
        u = urllib.parse.urljoin(base, href)
        u = urllib.parse.urldefrag(u)[0]
        return u
    except Exception:
        return ""

def fetch(url: str) -> str | None:
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        if r.status_code == 200 and "text/html" in r.headers.get("content-type", ""):
            return r.text
    except Exception:
        pass
    return None

def extract_links(base_url: str, html: str):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.find_all("a", href=True):
        u = normalize_url(base_url, a["href"])
        if u and same_domain(u):
            links.append(u)
    text_parts = []
    for el in soup.select("title,h1,h2,h3,code,strong,em,p,li"):
        txt = el.get_text(" ", strip=True)
        if txt:
            text_parts.append(txt[:300])
    return links, "\n".join(text_parts)

def score(url: str, text: str, tag: str) -> int:
    d = urllib.parse.urlparse(url).netloc.lower()
    s = DOMAIN_PRIORITY.get(d, 0) * 100
    if tag.lower() in url.lower():
        s += 20
    occ = len(re.findall(fr"\b{re.escape(tag)}\b", text))
    s += min(occ, 5) * 10
    return s

def check_url_alive(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    try:
        r = requests.head(url, headers={"User-Agent": USER_AGENT}, allow_redirects=True, timeout=CHECK_TIMEOUT)
        if r.status_code in (200, 301, 302):
            return True
        if r.status_code == 405:  # some sites block HEAD
            r2 = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=CHECK_TIMEOUT)
            return r2.status_code == 200
    except Exception:
        return False
    return False

# ───────────────────────────────────────────────────────────────
# Depth-limited BFS crawl
def crawl(tags: list[str]):
    visited: set[str] = set()
    queue: deque[tuple[str, int]] = deque((seed, 0) for seed in dict.fromkeys(SEEDS))  # unique seeds, depth 0
    pages = 0
    best_for_tag: dict[str, tuple[int, str]] = {}  # tag -> (score, url)

    while queue and pages < MAX_PAGES:
        url, depth = queue.popleft()
        if url in visited or not same_domain(url):
            continue
        visited.add(url)

        html = fetch(url)
        print(f"🌐 depth={depth} | {url} {'(ok)' if html else '(skip)'}")
        if not html:
            continue

        links, text = extract_links(url, html)
        pages += 1

        # scoring
        for t in tags:
            if re.search(fr"\b{re.escape(t)}\b", text):
                sc = score(url, text, t)
                if t not in best_for_tag or sc > best_for_tag[t][0]:
                    best_for_tag[t] = (sc, url)

        # enqueue children if depth limit not reached
        if depth < MAX_DEPTH:
            for u in links:
                if u not in visited:
                    queue.append((u, depth + 1))

        time.sleep(SLEEP_BETWEEN)

    return {t: u for t, (_, u) in best_for_tag.items()}

# ───────────────────────────────────────────────────────────────
def main():
    # paths — tweak to your layout
    src = Path("../assets/ddex-map.json")
    out = Path("../assets/ddex-map.updated.json")

    data = json.loads(src.read_text(encoding="utf-8"))
    tags = list(data.keys())
    print(f"🧭 Loaded {len(tags)} tags from {src}")
    print(f"🔁 BFS crawl up to depth {MAX_DEPTH}, cap {MAX_PAGES} pages…")

    scraped = crawl(tags)
    print(f"🔎 Found candidate URLs for {len(scraped)} tags")

    updated = {}
    for k, v in data.items():
        old = v.strip() if isinstance(v, str) else ""
        new = scraped.get(k)
        final_url = old

        # Update only placeholders
        if old.startswith("https://ddex.net/docs/") and new:
            final_url = new

        # Validate final URL: if dead → empty
        if final_url:
            if not check_url_alive(final_url):
                print(f"⚠️  DEAD → {k}: {final_url}  ->  cleared")
                final_url = ""

        updated[k] = final_url

    out.write_text(json.dumps(updated, indent=2), encoding="utf-8")
    print(f"✅ Updated map saved to {out}")

if __name__ == "__main__":
    main()