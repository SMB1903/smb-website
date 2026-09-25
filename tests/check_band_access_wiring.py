#!/usr/bin/env python3
"""Wiring gate: each portal gates its dashboard on smbAccess.check(db, user, '<its band>'),
renders the Your-bands line, and no page still uses the old UID-keyed approved list."""
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
    if not re.search(r"smbAccess\.check\(\s*db\s*,\s*user\s*,\s*'%s'\s*\)" % band, p.js): fails.append(f"{page}: dashboard not gated on smbAccess.check(db, user, '{band}')")
    if "members-your-bands" not in p.ids: fails.append(f"{page}: no #members-your-bands element")
    if "yourBandsHtml(" not in p.js: fails.append(f"{page}: Your-bands line never rendered")
    if "users/approved" in p.js: fails.append(f"{page}: old UID-keyed approved list still referenced")
    if "signOut()" not in p.js: fails.append(f"{page}: no sign-out on denial")
print("\n".join(fails) or f"OK — checked {len(PAGES)} pages: each gated on its own band flag, Your-bands rendered, old list gone")
sys.exit(1 if fails else 0)
