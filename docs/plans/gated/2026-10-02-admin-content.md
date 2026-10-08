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

## Delivery 2 — concerts (2026-10-02)
D6 **Concert store** `content/concerts/items/{id}`: band (smb|scb|bit), date (YYYY-MM-DD string, as the
   pages already parse), title, venue, address, time, tag, note, featured, posterUrl, createdAt.
   Rules: public read (concerts are public); write only if admin.
D7 **Pages read the store**: each page asks for its band's concerts; if the store has none for that band it
   falls back to today's JSON file, so nothing changes until the store is filled. Upcoming/past split, the
   SMB calendar and the Schema.org events all keep working unchanged because they consume the same list shape.
D8 **Admin "Concerts" section**: pick a band, add/edit/delete concerts (date, title, venue, address, time,
   tag with the known tags offered, note, featured, poster link with the existing posters offered).
   Validation: date YYYY-MM-DD, title and venue required, poster must be https:// or a site path.
D9 **Starter content** extends "Load starter content": copies each band's JSON file into the store the first
   time, only for bands that have no concerts yet.
Edge cases: bad date → refused; poster `javascript:` → refused; empty tag allowed; store read denied →
JSON fallback; band with concerts in store but another band empty → seeding fills only the empty band;
posters given as `../images/…` (Second Chance file) normalised to `/images/…`.

## Delivery 3 — band hall attachment (2026-10-08)
D10 **Attachment stored in the entry** (`content/bandhall`: fileName, fileType, fileData base64, fileSize,
    uploadedAt). Free plan has no file storage; a Firestore document holds up to 1 MiB, so the limit is 900 KB
    after in-browser shrinking of images (canvas, longest side ≤ 1600px, PNG then JPEG until it fits).
    Allowed: PNG, JPEG, PDF. Portals show an image inline, a PDF as a download link. The https link stays
    optional and can be cleared. Remove attachment = one click (two-step).
Edge cases: wrong type → refused; too big after shrinking → refused with a message; saving the text fields
keeps the existing attachment unless replaced/removed; attachment rendered with a data: URL only for the
allowed types (never from an arbitrary string); fallback still shows today's PDF link while the entry is empty.
