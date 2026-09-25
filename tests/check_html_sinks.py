#!/usr/bin/env python3
"""Gate: data that reaches innerHTML/src/href is escaped or scheme-checked.
- concert / gallery / recording / calendar fields must pass through escText(...)
- Firestore fileUrl must pass through safeUrl(...) before entering href
Parse-level over each page's inline JS (comments stripped)."""
import os, re, sys
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "second-chance/index.html", "back-in-time/index.html"]
FIELDS = r"(title|group|venue|address|time|note|tag|imageUrl|alt|duration|conductor|date|description)"
class P(HTMLParser):
    def __init__(s): super().__init__(); s.in_script=False; s.js=""
    def handle_starttag(s,t,a):
        if t=="script" and not dict(a).get("src") and dict(a).get("type") not in ("application/ld+json",): s.in_script=True
    def handle_endtag(s,t):
        if t=="script": s.in_script=False
    def handle_data(s,d):
        if s.in_script: s.js+=d
fails=[]
for page in PAGES:
    p=P(); p.feed(open(os.path.join(ROOT,page),encoding="utf-8").read())
    js=re.sub(r"//[^\n]*","",p.js)                      # drop line comments
    # a data field concatenated straight into a string: "+ c.title +" / "'+concert.title+'" / "+ item.alt" etc.
    for m in re.finditer(r"\+\s*(c|item|t|concert)\.%s\b(?!\s*[:,)\]])" % FIELDS, js):
        ctx=js[max(0,m.start()-12):m.end()]
        if "escText(" in js[max(0,m.start()-20):m.start()+2]: continue
        fails.append(f"{page}: unescaped field in HTML string near: {js[m.start():m.start()+40]!r}")
    for m in re.finditer(r"fileUrl", js):
        line=js[js.rfind("\n",0,m.start())+1: js.find("\n",m.end())]
        if "href" in line and "safeUrl(" not in line: fails.append(f"{page}: fileUrl reaches href without safeUrl(): {line.strip()[:90]}")
    if "escText" in js and "window.escText = function" not in js: fails.append(f"{page}: escText used but not defined")
print("\n".join(sorted(set(fails))) or f"OK — {len(PAGES)} pages: all data fields escaped before HTML, fileUrl scheme-checked")
sys.exit(1 if fails else 0)
