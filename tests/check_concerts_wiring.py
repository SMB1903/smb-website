#!/usr/bin/env python3
"""Wiring gate for delivery 2: each page loads its band's concerts from the store with the JSON file as
fallback; the SMB Admin tab has the Concerts section wired to smbConcerts.admin."""
import os, re, sys
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = {"index.html": "smb", "second-chance/index.html": "scb", "back-in-time/index.html": "bit"}
class P(HTMLParser):
    def __init__(s): super().__init__(); s.in_script=False; s.js=""; s.ids=set()
    def handle_starttag(s,t,a):
        a=dict(a)
        if t=="script": s.in_script=True
        if a.get("id"): s.ids.add(a["id"])
    def handle_endtag(s,t):
        if t=="script": s.in_script=False
    def handle_data(s,d):
        if s.in_script: s.js+=d
fails=[]
for page, band in PAGES.items():
    p=P(); p.feed(open(os.path.join(ROOT,page),encoding="utf-8").read())
    if not re.search(r"smbConcerts\.load\(\s*\w+\s*,\s*'%s'\s*\)" % band, p.js): fails.append(f"{page}: concerts not loaded from the store for band '{band}'")
    if "data/concerts.json" not in p.js: fails.append(f"{page}: JSON fallback removed (must stay until the store is seeded)")
p=P(); p.feed(open(os.path.join(ROOT,"index.html"),encoding="utf-8").read())
for el in ("admin-concerts","admin-concert-form","admin-concert-list","concert-band","concert-date","concert-title","concert-venue","concert-poster"):
    if el not in p.ids: fails.append(f"index.html: Admin concerts UI missing #{el}")
for fn in ("smbConcerts.admin.save(","smbConcerts.admin.remove(","smbConcerts.admin.seedFromJson("):
    if fn not in p.js: fails.append(f"index.html: {fn[:-1]} never called")
print("\n".join(fails) or "OK — pages read concerts from the store with JSON fallback; Admin concerts UI wired")
sys.exit(1 if fails else 0)
