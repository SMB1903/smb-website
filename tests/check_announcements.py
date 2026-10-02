#!/usr/bin/env python3
"""Gate: the Save the Date card is present in the Announcements panel of all three portals with every event."""
import os, re, sys
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "second-chance/index.html", "back-in-time/index.html"]
EVENTS = ["Nov 7", "Nov 8", "Nov 19", "Nov 20", "Dec 6", "Dec 13", "Dec 14", "Dec 17"]
class P(HTMLParser):
    def __init__(s): super().__init__(); s.depth=0; s.panel=None; s.text=""
    def handle_starttag(s,t,a):
        s.depth+=1
        if dict(a).get("id")=="panel-announcements": s.panel=s.depth
    def handle_endtag(s,t):
        if s.panel==s.depth: s.panel=None
        s.depth-=1
    def handle_data(s,d):
        if s.panel: s.text+=d+" "
fails=[]
for page in PAGES:
    p=P(); p.feed(open(os.path.join(ROOT,page),encoding="utf-8").read())
    if "Save the Date" not in p.text: fails.append(f"{page}: no Save the Date card in the Announcements panel"); continue
    for e in EVENTS:
        if not re.search(re.escape(e)+r"\b", p.text): fails.append(f"{page}: missing event {e}")
print("\n".join(fails) or f"OK — Save the Date card with {len(EVENTS)} events on all {len(PAGES)} portals")
sys.exit(1 if fails else 0)
