#!/usr/bin/env python3
"""Wiring gate for delivery 1: each portal renders announcements/band hall/executives from smbContent with the
hand-typed content as fallback; SMB Admin tab has the Content section with all actions wired."""
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
    for el in ("announcements-dynamic","announcements-fallback","bandhall-dynamic","bandhall-fallback","executives-dynamic","executives-fallback","panel-executives"):
        if el not in p.ids: fails.append(f"{page}: missing #{el}")
    if not re.search(r"smbContent\.loadAnnouncements\(\s*db\s*,\s*'%s'\s*\)" % band, p.js): fails.append(f"{page}: announcements not loaded for band '{band}'")
    for fn in ("smbContent.loadBandHall(", "smbContent.loadExecutives(", "smbContent.announcementsHtml(", "smbContent.bandHallHtml(", "smbContent.executivesHtml("):
        if fn not in p.js: fails.append(f"{page}: {fn[:-1]} not used")
    if "members/announcements/items" in p.js or "-members/announcements/items" in p.js: fails.append(f"{page}: old per-band announcements collection still read")
p=P(); p.feed(open(os.path.join(ROOT,"index.html"),encoding="utf-8").read())
for el in ("admin-content","admin-ann-form","admin-ann-list","admin-bandhall-form","admin-exec-form","admin-exec-list","admin-seed"):
    if el not in p.ids: fails.append(f"index.html: Admin content UI missing #{el}")
for fn in ("admin.saveAnnouncement(","admin.deleteAnnouncement(","admin.saveBandHall(","admin.saveExecutive(","admin.deleteExecutive(","admin.moveExecutive(","admin.seedDefaults("):
    if fn not in p.js: fails.append(f"index.html: {fn[:-1]} never called from the page")
if "confirm(" in p.js: fails.append("blocking confirm() used")
print("\n".join(fails) or "OK — portals read content from the store with fallbacks; Admin content UI fully wired")
sys.exit(1 if fails else 0)
