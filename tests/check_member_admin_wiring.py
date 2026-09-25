#!/usr/bin/env python3
"""Wiring gate: the SMB portal has an Admin tab + panel that is hidden by default and only revealed
when the signed-in member's access row has admin === true; the panel's controls reach smbAdmin."""
import os, re, sys
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class P(HTMLParser):
    def __init__(s): super().__init__(); s.in_script=False; s.js=""; s.els={}
    def handle_starttag(s,t,a):
        a=dict(a)
        if t=="script": s.in_script=True
        if a.get("id"): s.els[a["id"]]=a
    def handle_endtag(s,t):
        if t=="script": s.in_script=False
    def handle_data(s,d):
        if s.in_script: s.js+=d
p=P(); p.feed(open(os.path.join(ROOT,"index.html"),encoding="utf-8").read())
fails=[]
tab=p.els.get("portal-tab-admin"); panel=p.els.get("panel-admin")
if not tab: fails.append("no #portal-tab-admin button")
elif "display:none" not in (tab.get("style") or "").replace(" ",""): fails.append("admin tab is not hidden by default")
if not panel: fails.append("no #panel-admin panel")
if not re.search(r"res\.data\s*&&\s*res\.data\.admin\s*===\s*true", p.js): fails.append("admin tab not gated on res.data.admin === true")
for fn in ("smbAdmin.addMember(", "smbAdmin.updateMember(", "smbAdmin.removeMember(", "smbAdmin.resendInvite(", "smbAdmin.listMembers("):
    if fn not in p.js: fails.append(f"{fn[:-1]} never called from the page")
if "firebase.firestore.FieldValue.serverTimestamp()" not in p.js.split("smbAdmin.addMember(")[-1][:200]: fails.append("addMember not given a server timestamp for invitedAt")
if "confirm(" in p.js: fails.append("uses a blocking confirm() dialog")
if "adminFlagsFromRow" in p.js: fails.append("checkbox change still rewrites the whole row from the rendered table (F6)")
if "loadAdmin();" not in p.js.split("smbAdmin.updateMember(")[-1][:600]: fails.append("row not reloaded after a save")
if "initializeApp(firebaseConfig, " not in p.js: fails.append("no secondary Firebase app for account creation (admin would be signed out)")
print("\n".join(fails) or "OK — Admin tab hidden by default, revealed only for admin===true, all smbAdmin actions wired, no blocking dialogs")
sys.exit(1 if fails else 0)
