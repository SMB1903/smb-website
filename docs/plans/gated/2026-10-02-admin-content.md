# Admin-editable portal content — TDD plan, delivery 1 (2026-10-02)

Problem: announcements, the band-hall cleaning entry and the executives list are typed into the three
portal pages by hand; every change needs code. Prior art sweep (`grep -n "announcements/items\|panel-bandhall\|panel-executives" *.html */index.html`):
each portal already queries `<band>-members/announcements/items` (always empty) and renders title/body/date;
nothing reads a band-hall or executives collection. Doing nothing = every wording change is a code change.

## Deliverables
D1 **Content store** (Firestore, admin-writable, member-readable):
   - `content/announcements/items/{id}`: title, body, date (timestamp), bands {smb,scb,bit}, createdAt
   - `content/bandhall` (single doc): heading, text, linkLabel, linkUrl
   - `content/executives/items/{id}`: name, role, order
   Rules: read if signed in and on ANY band list; write only if admin.
D2 **Portals read from the store** (all three pages, shared `smbContent` block):
   announcements filtered to the page's band, newest first; band-hall card from the doc; executives list
   on all three portals (new tab on Second Chance and Back in Time). While a section is EMPTY the page keeps
   showing today's hand-typed content as a fallback, so nothing goes blank before the store is filled.
D3 **Admin "Content" section** (SMB Admin tab): announcements add/edit/delete with band tick boxes;
   band-hall heading/text/link edit; executives add/edit/delete/move up/down. Validation: an announcement
   needs a title or body and at least one band; an executive needs name and role; a link must be https.
   Two-step delete (no blocking dialogs).
D4 **Starter content**: a "Load starter content" button, shown only while a section is empty, writes
   today's content (the two announcements, the band-hall entry, the 14 executives) into the store.
D5 **Tripwire** rows for D1–D4.

## Edge cases (tests)
- announcement with no bands ticked → refused; with no title and no body → refused
- announcement for scb only → not shown on SMB page, shown on Second Chance
- empty store → fallback markup shown; non-empty → fallback hidden (no duplicates)
- executives order: move up at top / move down at bottom → no-op; ids preserved
- band-hall link not https → refused; empty link → allowed (text only)
- all rendering escapes strings (title, body, name, role, heading, text, label)
- store read denied (rules not yet published) → fallback shown, no crash

## UX (David/Mary-Gwen)
- Admin tab → Content → add an announcement for SMB + Second Chance → appears on both, not on Back in Time.
- Edit the band-hall link → the three portals show the new link.
- Move an executive up → order changes on all three portals.

## Assumptions
- Per-band targeting of announcements is a display filter, not a security boundary (one organisation).
- Delivery 2 (concerts) is a separate plan.
