#!/usr/bin/env python3
"""Tripwire for docs/plans/gated/2026-09-30-member-invites.md: every deliverable is BUILT + WIRED + EXERCISED.
Each row names the test label that proves it; the label must exist in the test file (parsed from source, not
grepped from a docstring) and the suite must be green. Run: python3 tests/check_tripwire.py"""
import os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS = [
 ("C-D10 attachment render",      "tests/test_content.js", "PNG attachment rendered inline as an image"),
 ("C-D10 attachment limits",      "tests/test_content.js", "attachment over the limit refused"),
 ("C-D10 keep/remove attachment", "tests/test_content.js", "removeFile clears the attachment"),
 ("K-D6/D7 store per band, sorted", "tests/test_concerts.js", "load: own band only, sorted by date ascending"),
 ("K-D7 fallback on denied",       "tests/test_concerts.js", "load: denied → empty"),
 ("K-D8 validation",               "tests/test_concerts.js", "normalize: javascript: poster refused"),
 ("K-D8 admin save/edit",          "tests/test_concerts.js", "save: edit updates in place, band kept"),
 ("K-D9 seed from files",          "tests/test_concerts.js", "seed: fills SMB + 2CB from files, leaves BIT (already has concerts) alone"),
 ("K-D7/D8 wired",                 "tests/check_concerts_wiring.py", None),
 ("C-D1/D2 announcements per band", "tests/test_content.js", "SMB sees its own + everyone, not 2CB-only"),
 ("C-D2 fallback when empty",      "tests/test_content.js", "empty list → empty string (fallback stays visible)"),
 ("C-D2 band hall link safety",    "tests/test_content.js", "band hall escaped and non-https link not rendered as a link"),
 ("C-D3 admin validation",         "tests/test_content.js", "announcement needs at least one band"),
 ("C-D3 executives reorder",       "tests/test_content.js", "move up swaps with the previous"),
 ("C-D4 starter content",          "tests/test_content.js", "seed fills empty announcements + band hall, leaves non-empty executives alone"),
 ("C-D2/D3 wired",                 "tests/check_content_wiring.py", None),
 ("D1 invite creation + mailto",   "tests/test_member_invites.js", "mailto body has the link, expiry, junk hint, band name"),
 ("D1 add creates an invite",     "tests/test_member_invites.js", "addMember creates an invite for the member"),
 ("D8 table buttons",             "tests/test_member_invites.js", "Reset email only on active rows"),
 ("D2 redemption happy path",     "tests/test_member_invites.js", "happy path → account created"),
 ("D6 row from invite, server-checkable", "tests/test_member_invites.js", "access row written from the INVITE flags with inviteId/invitedAt/activatedAt"),
 ("D6 addMember writes no row",   "tests/test_member_invites.js", "addMember writes NO access row (the row is created on acceptance)"),
 ("D6 reissue revokes",           "tests/test_member_invites.js", "earlier invites for the SAME email are revoked; other people's are untouched"),
 ("D7 existing login accepts",    "tests/test_member_invites.js", "existing login: sign-in → row created, invite deleted"),
 ("D8 pending in admin list",     "tests/test_member_invites.js", "list merges active rows and pending invites, one line per email"),
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
        if not re.search(r"assert\([\s\S]{0,600}?['\"]" + re.escape(label) + r"['\"]", code): fails.append(f"{name}: test label not found in {f}")
    cmd = ["node", f] if f.endswith(".js") else ["python3", f]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0: fails.append(f"{name}: {f} is RED")
n = len(ROWS)
print("\n".join(fails) or f"Tripwire: {n}/{n} — every deliverable built, wired, and exercised by a green test")
sys.exit(1 if fails else 0)
