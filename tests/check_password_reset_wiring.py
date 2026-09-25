#!/usr/bin/env python3
"""Wiring gate: each portal login screen has a reset link that reaches a handler which calls Firebase.
Parses the HTML; does not grep prose. Run: python3 tests/check_password_reset_wiring.py"""
import os, sys
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "second-chance/index.html", "back-in-time/index.html"]
class P(HTMLParser):
    def __init__(s): super().__init__(); s.depth=0; s.login_depth=None; s.link=None; s.status=False; s.in_script=False; s.js=""
    def handle_starttag(s, t, a):
        a=dict(a); s.depth+=1
        if a.get("id")=="members-login-screen": s.login_depth=s.depth
        if s.login_depth and t=="a" and a.get("data-action")=="reset-password": s.link=a
        if s.login_depth and a.get("id")=="reset-status": s.status=True
        if t=="script": s.in_script=True
    def handle_endtag(s, t):
        if t=="script": s.in_script=False
        if s.login_depth==s.depth: s.login_depth=None
        s.depth-=1
    def handle_data(s, d):
        if s.in_script: s.js+=d
fails=[]
for page in PAGES:
    p=P(); p.feed(open(os.path.join(ROOT,page),encoding="utf-8").read())
    if not p.link: fails.append(f"{page}: no reset-password link inside the login screen"); continue
    if not p.status: fails.append(f"{page}: no #reset-status element inside the login screen")
    handler=(p.link.get("onclick") or "").split("(")[0].strip()
    if not handler or f"window.{handler} = function" not in p.js: fails.append(f"{page}: link handler '{handler}' not defined in page JS")
    if ".sendPasswordResetEmail(" not in p.js: fails.append(f"{page}: JS never calls sendPasswordResetEmail")
print("\n".join(fails) or f"OK — checked {len(PAGES)} pages: reset link wired to a defined handler that calls Firebase")
sys.exit(1 if fails else 0)
