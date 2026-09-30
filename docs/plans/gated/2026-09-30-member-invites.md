# Member invitations via the admin's own email — TDD plan (2026-09-30)

Problem (measured 2026-09-25, live): Firebase's password-reset email is the only way a new member gets a
password. Its link lasts ~1 hour (Firebase-fixed, not configurable from the client), and the email lands in
junk (Peter, 2026-09-25). Firebase refuses email-template edits for this project ("contact Firebase Support").

Prior art sweep: `grep -rn "sendPasswordResetEmail\|createUserWithEmailAndPassword\|mailto:" *.html */index.html`
→ account creation lives only in `smbAdmin.addMember` (index.html) via a secondary Firebase app; no invite
concept exists anywhere. Doing nothing = every new member depends on a 1-hour email that lands in junk.

## Deliverables
D1 **Invite creation** (`smbAdmin.createInvite`, index.html). Admin "Add member" writes the access row (as now)
   and an `invites/{token}` doc `{email, createdBy, createdAt, expiresAt}`; token = 32 crypto-random base62
   chars; expiry 7 days. No Firebase account is created by the admin any more (secondary app removed).
   Result panel shows: **Open email** (a `mailto:` with subject + body + link), **Copy link**, and the link.
   Per-row **Invite link** button makes a fresh invite for anyone; **Reset email** (Firebase) only for rows
   that have signed in before.
   Happy path: admin adds jane@… → mail app opens addressed to Jane with the link → Jane receives it from a
   person she knows.
D2 **Invite redemption** (`smbInvite`, index.html). `saintmarysband.ca/?invite=TOKEN#members` → page reads the
   invite → shows "Welcome, set your password" (email fixed, password + confirm) → creates the account →
   deletes the invite → normal sign-in flow routes Jane to her band.
D3 **Sign-in routing on all three pages.** A signed-in member who is not on THIS band's list but IS on another
   stays signed in and sees "This portal is for X members. Your bands: …" with links; only a member on no list
   is signed out.
D4 **Rules** (console, David pastes): `invites/{token}`: get allowed only while `expiresAt > request.time`;
   list admin-only; create admin-only with typed fields and expiry ≤ 31 days; delete by admin or by the
   signed-in owner of the email; no update.
D5 **Tripwire** `tests/check_tripwire.py`: each deliverable → named test present and green.

## Edge cases (each has a test)
- expired token → "expired or already used"; missing/used token → same message (no distinction leaks)
- token for an email that already has an account → "you already have an account, use Forgot your password"
- password < 8 chars, or confirm mismatch → told, nothing created
- someone else already signed in when opening an invite → signed out first, invite proceeds
- invite delete fails after account creation → account still works (best-effort, logged)
- mailto: email/subject/body URL-encoded (`+`, `&`, apostrophes); link placed before `#members`
- Add for an email already on the list → 'duplicate' with hint to use Invite link (no second row)
- admin cannot invite an empty/invalid email; token regex `[A-Za-z0-9]{20,64}` on the way in
- denial routing: other bands → stay signed in + links; no bands → sign out; check error → retry message

## UX tests (manual by David/Mary-Gwen; automated where the seam allows)
- Add member → Mail opens with To/Subject/Body prefilled → Send → member clicks → sets password → lands in
  their band's portal with "Your bands" line. (Automated: mailto composition; redemption logic with fakes;
  local browser check of the invite screen with a bogus token → "expired or already used".)
- 2CB-only member signs in on SMB page → stays signed in, sees link to Second Chance portal.

## Integration surface
- index.html: Admin tab (add flow, table buttons, result panel), members section (invite screen), portal IIFE
  (invite detection on load), smbSignInUi (other-bands message). second-chance/back-in-time: smbSignInUi +
  denial glue only. Rules: +invites. Tests: 4 node suites, 6 python gates, +tripwire.
- Removed: secondary Firebase app `admin-helper`, `resendInvite`; gate that required the secondary app flips.
- Unchanged: Forgot-your-password (Firebase, 1 hour) for existing accounts; sign-up stays ON in Firebase.

## Assumptions
- "From" address: `mailto:` cannot choose the sending account; Mary-Gwen sets saintmarysbandsj@gmail.com as
  her mail app's default once (Mail → Settings → Composing → "Send new messages from").
- 7-day expiry (David agreed). Invites are single-use (deleted on redemption).

## Revision B (2026-09-30, after audit #3 / Codex) — the invitation must BE the authorization
Problem (verified: addMember wrote the access row before any acceptance): with public sign-up on, anyone who
learns an invited email can create the Firebase login first and inherit the pre-written row. The invitation
only gated a form. Also: reissue did not revoke earlier invitations; expiry was checked at page load only.

D6 Invite carries the flags; the access row is created on acceptance. addMember writes ONLY an invite document
   (email, flags smb/scb/bit/admin, createdBy, createdAt, expiresAt) and revokes earlier invites for that email.
   Acceptance (signed in as that email, new login or existing) writes the access row (flags, inviteId, invitedAt
   from the invite, activatedAt); rules allow that create only when the named invite exists, is unexpired, is
   for that email and its flags equal the row's flags; then the invite is deleted. Expiry is enforced
   server-side at the moment of acceptance.
D7 Existing login accepts by signing in with the existing password (or Forgot-password first).
D8 Admin table shows pending invitations alongside active rows: "Invited <date> · not yet accepted"; ticks edit
   the invite's flags; Remove deletes the invites; Invite link reissues (revoking older). Active rows: ticks and
   Remove as before; Reset email (Firebase).
D9 Rules: lastSignIn self-update must equal request.time; invites update admin-only and limited to flags;
   access create by the member only through acceptingInvite().
Edge cases: attacker pre-creates the login → no row (rules); the member follows D7 after a reset. Invite for an
email with an ACTIVE row → duplicate at add time. Flags tampered on the client → rules reject. Expired at submit
time → rules reject → "expired" message. Two invites for one email → reissue revokes. Admin unticks everything on
a pending invite → allowed (row would be inert).
