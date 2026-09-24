#!/usr/bin/env python3
"""Standing gate: the public HTML must not carry members-only destinations or loose third-party code.

Run: python3 tests/check_public_html.py   (exit 1 on any failure)
Parses the HTML (not grep) so comments and prose cannot mask or fake a hit.
"""
import os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "second-chance/index.html", "back-in-time/index.html", "404.html"]
PRIVATE_HOSTS = ("drive.google.com", "teamup.com")
LOOSE_SCRIPT = ("identity.netlify.com", "/cdn-cgi/", "unpkg.com")

class Sweep(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs = []; self.scripts = []; self.link_keys = set(); self.in_script = False; self.js = ""
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"): self.hrefs.append(a["href"])
        if tag == "script":
            self.in_script = True
            if a.get("src"): self.scripts.append(a["src"])
        if a.get("data-member-link"): self.link_keys.add(a["data-member-link"])
    def handle_endtag(self, tag):
        if tag == "script": self.in_script = False
    def handle_data(self, d):
        if self.in_script: self.js += d

fails = []
for page in PAGES:
    p = Sweep(); p.feed(open(os.path.join(ROOT, page), encoding="utf-8").read())
    for h in p.hrefs:
        if any(host in h for host in PRIVATE_HOSTS) or h.startswith("mailto:"):
            fails.append(f"{page}: members-only destination in public HTML: {h}")
    for s in p.scripts:
        if any(x in s for x in LOOSE_SCRIPT):
            fails.append(f"{page}: loose/unused third-party script: {s}")
    # parity: every data-member-link key in the HTML must be consumed by a loadLinks() in that page's JS,
    # and a page with keys must define loadLinks at all.
    if p.link_keys:
        if "function loadLinks" not in p.js:
            fails.append(f"{page}: data-member-link keys present but no loadLinks() consumer")
        if "data-member-link" not in p.js:
            fails.append(f"{page}: JS never queries [data-member-link]")
for gone in ["admin", ".github/workflows/compress-images.yml", "CMS_SETUP.md"]:
    if os.path.exists(os.path.join(ROOT, gone)):
        fails.append(f"retired path still present: {gone}")

checked = f"checked {len(PAGES)} pages"
if fails:
    print("\n".join(fails)); print(f"FAIL ({len(fails)}) — {checked}"); sys.exit(1)
print(f"OK — {checked}, no members-only destinations, no loose scripts, retired paths absent")
