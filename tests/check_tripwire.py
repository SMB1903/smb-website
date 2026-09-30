#!/usr/bin/env python3
"""Tripwire for docs/plans/gated/2026-09-30-member-invites.md: every deliverable is BUILT + WIRED + EXERCISED.
Each row names the test label that proves it; the label must exist in the test file (parsed from source, not
grepped from a docstring) and the suite must be green. Run: python3 tests/check_tripwire.py"""
import os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS = [
 ("D1 invite creation + mailto",   "tests/test_member_invites.js", "mailto body has the link, expiry, junk hint, band name"),
 ("D1 add = row + invite, no acct","tests/test_member_invites.js", "addMember creates an invite for the member"),
 ("D1 table buttons",             "tests/test_member_invites.js", "Reset email button only for rows that have signed in"),
 ("D2 redemption happy path",     "tests/test_member_invites.js", "happy path → account created, invite deleted"),
 ("D2 expired/used message",      "tests/test_member_invites.js", "expired and used share one message"),
 ("D3 other-bands routing",       "tests/test_signin_ui.js",      "otherBands → link to the band they do belong to"),
 ("D1/D2 wired in page",          "tests/check_member_admin_wiring.py", None),
 ("D3 wired on all pages",        "tests/check_band_access_wiring.py",  None),
]
fails = []
for name, f, label in ROWS:
    src = open(os.path.join(ROOT, f), encoding="utf-8").read()
    if label:
        # the label must appear as a string literal argument to assert(...), not in a comment
        code = re.sub(r"//[^\n]*", "", src)
        if not re.search(r"assert\([^;]*?['\"]" + re.escape(label) + r"['\"]", code, re.S): fails.append(f"{name}: test label not found in {f}")
    cmd = ["node", f] if f.endswith(".js") else ["python3", f]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0: fails.append(f"{name}: {f} is RED")
n = len(ROWS)
print("\n".join(fails) or f"Tripwire: {n}/{n} — every deliverable built, wired, and exercised by a green test")
sys.exit(1 if fails else 0)
