#!/usr/bin/env python3
"""Gate: every function named in an inline onclick/onsubmit/onchange attribute must be defined on window
(inline handlers run in global scope; a function declared inside an IIFE is unreachable from them).
Origin: 2026-10-18 — adminRestoreSection() was declared inside the portal IIFE and the Admin tab stuck on 'Loading…'."""
import os, re, sys
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "second-chance/index.html", "back-in-time/index.html", "404.html"]
def strip_code(js):
    """Crudely remove comments and string/regex literals so braces can be counted."""
    js = re.sub(r"/\*[\s\S]*?\*/", "", js)
    # regex literals (after an operator/opening token) before strings, so a quote inside /"/g cannot fool the string stripper
    js = re.sub(r"([(,=!&|?{};\n\[]|\breturn\b)(\s*)/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/[gimsuy]*", r"\1\2''", js)   # regex literals (no ':' context: 'https://' inside strings)
    js = re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"", "''", js)   # strings BEFORE line comments ('//' inside a string is not a comment)
    js = re.sub(r"//[^\n]*", "", js)
    return js
def top_level_decl(js, fn):
    code = strip_code(js)
    for m in re.finditer(r"\bfunction\s+%s\s*\(" % re.escape(fn), code):
        before = code[:m.start()]
        if before.count("{") - before.count("}") == 0: return True
    return False
class P(HTMLParser):
    def __init__(s): super().__init__(); s.in_script=False; s.js=""; s.scripts=[]; s.cur=""; s.calls=set()
    def handle_starttag(s,t,a):
        a=dict(a)
        if t=="script": s.in_script=True
        for k in ("onclick","onsubmit","onchange","onmouseover","onmouseout","oninput"):
            if a.get(k):
                v = re.sub(r"'[^']*'|\"[^\"]*\"", "''", a[k])          # drop string literals (CSS/function text inside them)
                for fn in re.findall(r"(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(", v):   # bare calls only, not .method(
                    if fn not in ("return","event","this","function","if","while","for"): s.calls.add(fn)
    def handle_endtag(s,t):
        if t=="script": s.in_script=False; s.scripts.append(s.cur); s.cur=""
    def handle_data(s,d):
        if s.in_script: s.js+=d; s.cur+=d
fails=[]
for page in PAGES:
    p=P(); p.feed(open(os.path.join(ROOT,page),encoding="utf-8").read())
    for fn in sorted(p.calls):
        if re.search(r"window\.%s\s*=\s*function" % re.escape(fn), p.js): continue
        # a function DECLARED at brace-depth 0 of a script is global too (indentation is irrelevant)
        if any(top_level_decl(js, fn) for js in p.scripts): continue
        fails.append(f"{page}: onclick calls {fn}() but it is not defined on window / at top level")
print("\n".join(fails) or f"OK — every inline handler target is globally reachable on {len(PAGES)} pages")
sys.exit(1 if fails else 0)
