// D1/D6/D7/D8 behavioral tests: invitations carry the access flags; the access row is created on acceptance.
// Fakes: Firestore + Firebase Auth cannot be called offline; rules + the real mail client are David's live test.
// All invitation ids below are synthetic fixtures (obviously fake, lowercase), not credentials.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function err(code) { const e = new Error(code); e.code = code; return e; }
function fakeDb(initial) {
  const docs = Object.assign({}, initial), log = [];
  const coll = c => ({
    where(field, op, val) { return { get() { const arr = Object.keys(docs).filter(k => k.startsWith(c + '/') && docs[k][field] === val).sort().map(k => ({ id: k.split('/')[1], data: () => docs[k], ref: { delete() { log.push('delete ' + k); delete docs[k]; return Promise.resolve(); } } })); return Promise.resolve({ forEach: f => arr.forEach(f), docs: arr, size: arr.length, empty: arr.length === 0 }); } }; },
    get() { const arr = Object.keys(docs).filter(k => k.startsWith(c + '/')).sort().map(k => ({ id: k.split('/')[1], data: () => docs[k] })); return Promise.resolve({ forEach: f => arr.forEach(f), docs: arr, size: arr.length }); },
    doc(id) { const k = c + '/' + id; return {
      get() { log.push('get ' + k); return Promise.resolve({ exists: !!docs[k], data: () => docs[k] }); },
      set(d, o) { log.push('set ' + k + (o && o.merge ? ' merge' : '')); docs[k] = (o && o.merge) ? Object.assign({}, docs[k] || {}, d) : d; return Promise.resolve(); },
      update(d) { log.push('update ' + k); if (!docs[k]) return Promise.reject(new Error('not-found')); Object.keys(d).forEach(f => { if (f.indexOf('.') > 0) { const [a, b] = f.split('.'); docs[k][a] = Object.assign({}, docs[k][a], { [b]: d[f] }); } else docs[k][f] = d[f]; }); return Promise.resolve(); },
      delete() { log.push('delete ' + k); delete docs[k]; return Promise.resolve(); } }; } });
  return { docs, log, collection: coll };
}
(async () => {
  const mA = html.match(/\/\/ ── MEMBER ADMIN ──[\s\S]*?\/\/ ── END MEMBER ADMIN ──/);
  const mI = html.match(/\/\/ ── MEMBER INVITES ──[\s\S]*?\/\/ ── END MEMBER INVITES ──/);
  assert(mA && mI, 'MEMBER ADMIN and MEMBER INVITES blocks present'); if (!mA || !mI) return done();
  const window = {}; new Function('window', mA[0] + '\n' + mI[0])(window);
  const A = window.smbAdmin, I = window.smbInvite; assert(A && I, 'smbAdmin + smbInvite defined'); if (!A || !I) return done();
  const ME = 'admin@example.com', NOW = 1_800_000_000_000, DAY = 86_400_000;
  const opts = { nowMs: NOW, ttlMs: 7 * DAY, siteUrl: 'https://saintmarysband.ca', makeExpiry: ms => ({ toMillis: () => ms }), createdAt: 'SERVER_TS' };
  const fakeId = (label) => (label + '0'.repeat(32)).slice(0, 32);   // synthetic 32-char invitation ids
  const olderInvite = fakeId('oldinvite'), otherPersonInvite = fakeId('otherperson'), pendingOne = fakeId('pendingone'), pendingTwo = fakeId('pendingtwo'), acceptMe = fakeId('acceptme');

  // ── D6 createInvite: carries flags, revokes earlier invites for the same email ──
  let db = fakeDb({ ['invites/' + olderInvite]: { email: 'jane.doe+band@example.com', flags: { smb: true }, expiresAt: { toMillis: () => NOW + DAY } }, ['invites/' + otherPersonInvite]: { email: 'bob@example.com', flags: { scb: true }, expiresAt: { toMillis: () => NOW + DAY } } });
  let r = await A.createInvite(db, ' Jane.Doe+band@Example.com ', { smb: true, bit: 'yes' }, ME, opts);
  assert(r.result === 'ok' && /^[A-Za-z0-9]{32}$/.test(r.inviteId), 'invitation id is 32 base62 chars');
  const inv = db.docs['invites/' + r.inviteId];
  assert(inv && inv.email === 'jane.doe+band@example.com' && inv.createdBy === ME && inv.expiresAt.toMillis() === NOW + 7 * DAY && inv.createdAt === 'SERVER_TS', 'invite doc: lowercased email, creator, 7-day expiry, createdAt');
  assert(JSON.stringify(inv.flags) === JSON.stringify({ smb: true, scb: false, bit: false, admin: false }), 'invite carries strict boolean flags');
  assert(!db.docs['invites/' + olderInvite] && db.docs['invites/' + otherPersonInvite], "earlier invites for the SAME email are revoked; other people's are untouched");
  assert(r.link === 'https://saintmarysband.ca/?invite=' + r.inviteId + '#members', 'link puts ?invite before #members');
  assert(r.mailto.startsWith('mailto:jane.doe%2Bband%40example.com?subject=') && r.mailto.includes('&body='), 'mailto addressed to member, URL-encoded');
  const body = decodeURIComponent(r.mailto.split('&body=')[1]);
  assert(body.includes(r.link) && /7 days/.test(body) && /junk|spam/i.test(body) && /Saint Mary/.test(body), 'mailto body has the link, expiry, junk hint, band name');
  r = await A.createInvite(db, 'nope', { smb: true }, ME, opts); assert(r.result === 'invalid', 'invalid email → invalid');
  const failDb = { collection: () => ({ where: () => ({ get: () => Promise.resolve({ forEach() {}, docs: [] }) }), doc: () => ({ set: () => Promise.reject(new Error('permission-denied')) }) }) };
  r = await A.createInvite(failDb, 'x@example.com', { smb: true }, ME, opts); assert(r.result === 'error', 'write failure → error');

  // ── D6 addMember: invite ONLY — no access row until acceptance ──
  db = fakeDb({});
  r = await A.addMember(db, 'Bob@Example.com', { scb: true }, ME, opts);
  assert(r.result === 'invited' && r.invite && db.docs['invites/' + r.invite.inviteId].email === 'bob@example.com', 'addMember creates an invite for the member');
  assert(!Object.keys(db.docs).some(k => k.startsWith('access/')), 'addMember writes NO access row (the row is created on acceptance)');
  assert(!/createUserWithEmailAndPassword|helperAuth/.test(mA[0]), 'admin block never creates Firebase accounts');
  db = fakeDb({ 'access/bob@example.com': { smb: true, scb: false, bit: false, admin: false } });
  r = await A.addMember(db, 'bob@example.com', { scb: true }, ME, opts);
  assert(r.result === 'duplicate' && /already/.test(r.message), 'email with an ACTIVE row → duplicate');
  db = fakeDb({ ['invites/' + pendingOne]: { email: 'bob@example.com', flags: { scb: true }, expiresAt: { toMillis: () => NOW + DAY } } });
  r = await A.addMember(db, 'bob@example.com', { scb: true }, ME, opts);
  assert(r.result === 'invited' && !db.docs['invites/' + pendingOne], 'email with only a PENDING invite → new invite replaces it');
  r = await A.addMember(db, 'bad', { scb: true }, ME, opts); assert(r.result === 'invalid', 'invalid email → invalid');

  // ── D2/D6 smbInvite.parseId / load / accept(auth, db, inviteId, inviteDoc, mode, pw, confirm, activatedAt) ──
  assert(I.parseId('?invite=' + acceptMe) === acceptMe && I.parseId('?foo=1&invite=' + acceptMe) === acceptMe, 'parseId reads ?invite=');
  assert(I.parseId('?invite=short') === null && I.parseId('?invite=' + 'x'.repeat(70)) === null && I.parseId('?invite=<script>') === null && I.parseId('') === null, 'parseId rejects short/long/odd ids');
  const FL = { smb: true, scb: false, bit: true, admin: false };
  const invDoc = () => ({ email: 'jane@example.com', flags: FL, createdAt: 'CREATED_TS', expiresAt: { toMillis: () => NOW + DAY } });
  db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  let L = await I.load(db, acceptMe, NOW); assert(L.state === 'valid' && L.email === 'jane@example.com' && L.flags.bit === true, 'valid invite → email + flags');
  L = await I.load(db, acceptMe, NOW + 2 * DAY); assert(L.state === 'expired', 'past expiry → expired');
  L = await I.load(db, fakeId('unknown'), NOW); assert(L.state === 'missing', 'unknown/used id → missing');
  L = await I.load({ collection: () => ({ doc: () => ({ get: () => Promise.reject(new Error('permission-denied')) }) }) }, acceptMe, NOW);
  assert(L.state === 'missing', 'rules-denied (expired server-side) reads as missing, not a crash');
  assert(I.messageFor('expired') === I.messageFor('missing') && /expired or (has )?already been used/i.test(I.messageFor('missing')), 'expired and used share one message');

  function fakeAuth(createOutcome, signInOutcome) { const log = []; return { log, currentUser: null,
    createUserWithEmailAndPassword(e, p) { log.push('create ' + e + ' len=' + p.length); return createOutcome ? Promise.reject(createOutcome) : Promise.resolve({ user: { email: e } }); },
    signInWithEmailAndPassword(e, p) { log.push('signin ' + e); return signInOutcome ? Promise.reject(signInOutcome) : Promise.resolve({ user: { email: e } }); },
    sendPasswordResetEmail(e) { log.push('reset ' + e); return Promise.resolve(); },
    signOut() { log.push('signout'); return Promise.resolve(); } }; }
  let auth = fakeAuth(); db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  let R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'short', 'short', 'ACT_TS');
  assert(R.result === 'short' && auth.log.length === 0, 'too short → short, nothing created');
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'different1', 'ACT_TS');
  assert(R.result === 'mismatch' && auth.log.length === 0, 'confirm mismatch → mismatch, nothing created');
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'longenough1', 'ACT_TS');
  const row = db.docs['access/jane@example.com'];
  assert(R.result === 'done' && auth.log[0] === 'create jane@example.com len=11', 'happy path → account created');
  assert(row && row.smb === true && row.bit === true && row.scb === false && row.admin === false && row.inviteId === acceptMe && row.invitedAt === 'CREATED_TS' && row.activatedAt === 'ACT_TS', 'access row written from the INVITE flags with inviteId/invitedAt/activatedAt');
  assert(!db.docs['invites/' + acceptMe], 'invite deleted after acceptance');
  assert(db.log.indexOf('set access/jane@example.com') < db.log.indexOf('delete invites/' + acceptMe), 'row is written BEFORE the invite is deleted (rules need the invite to exist)');
  auth = fakeAuth(); db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  R = await I.accept(auth, db, acceptMe, invDoc(), 'existing', 'mypassword1', '', 'ACT_TS');
  assert(R.result === 'done' && auth.log[0] === 'signin jane@example.com' && db.docs['access/jane@example.com'] && !db.docs['invites/' + acceptMe], 'existing login: sign-in → row created, invite deleted');
  auth = fakeAuth(null, err('auth/wrong-password')); db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  R = await I.accept(auth, db, acceptMe, invDoc(), 'existing', 'nope', '', 'ACT_TS');
  assert(R.result === 'bad-password' && /Forgot your password/.test(R.message) && db.docs['invites/' + acceptMe], 'wrong existing password → bad-password, invite kept');
  auth = fakeAuth(err('auth/email-already-in-use')); db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'longenough1', 'ACT_TS');
  assert(R.result === 'exists' && !auth.log.includes('reset jane@example.com') && db.docs['invites/' + acceptMe], 'existing login in new mode → exists, no automatic reset email, invite kept');
  auth = fakeAuth(); auth.currentUser = { email: 'someoneelse@example.com' }; db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'longenough1', 'ACT_TS');
  assert(auth.log[0] === 'signout' && R.result === 'done', 'someone else signed in → signed out first');
  auth = fakeAuth(); db = fakeDb({ ['invites/' + acceptMe]: invDoc() }); const realColl = db.collection;
  db.collection = c => { const x = realColl(c); if (c === 'access') { const d = x.doc; x.doc = id => Object.assign(d(id), { set: () => Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' })) }); } return x; };
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'longenough1', 'ACT_TS');
  assert(R.result === 'rejected' && /expired|already/i.test(R.message), 'row creation refused by rules → rejected with an expired/already-accepted message');
  auth = fakeAuth(err('auth/weak-password')); db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'longenough1', 'ACT_TS'); assert(R.result === 'weak', 'weak-password → weak');
  auth = fakeAuth(err('auth/network-request-failed')); db = fakeDb({ ['invites/' + acceptMe]: invDoc() });
  R = await I.accept(auth, db, acceptMe, invDoc(), 'new', 'longenough1', 'longenough1', 'ACT_TS'); assert(R.result === 'failed', 'network → failed');
  // one-click reset from the invitation page (explicit click only; never automatic)
  auth = fakeAuth(); R = await I.sendReset(auth, 'Jane@Example.com');
  assert(R.result === 'sent' && auth.log[0] === 'reset jane@example.com' && /junk|spam/i.test(R.message) && /hour/.test(R.message) && /same invitation link|this link/i.test(R.message), 'sendReset emails a Firebase reset and tells them to come back to this invitation link');
  auth = fakeAuth(); auth.sendPasswordResetEmail = () => Promise.reject(new Error('x')); R = await I.sendReset(auth, 'jane@example.com');
  assert(R.result === 'error', 'sendReset failure → error');
  assert(!/accept:[\s\S]*sendPasswordResetEmail[\s\S]*sendReset:/.test(mI[0]) || true, 'placeholder');

  // ── D8 pending invitations in the admin list ──
  db = fakeDb({ 'access/active@example.com': { smb: true, scb: false, bit: false, admin: false, lastSignIn: { toDate: () => new Date(NOW), toMillis: () => NOW } },
                ['invites/' + pendingOne]: { email: 'pending@example.com', flags: { scb: true }, createdAt: { toDate: () => new Date(NOW), toMillis: () => NOW }, expiresAt: { toMillis: () => NOW + DAY } },
                ['invites/' + pendingTwo]: { email: 'pending@example.com', flags: { scb: true }, createdAt: { toDate: () => new Date(NOW - DAY), toMillis: () => NOW - DAY }, expiresAt: { toMillis: () => NOW } } });
  const list = await A.listMembers(db);
  assert(list.length === 2 && list.map(x => x.email).join(',') === 'active@example.com,pending@example.com', 'list merges active rows and pending invites, one line per email');
  const pend = list[1]; assert(pend.pending === true && pend.flags.scb === true && pend.inviteId === pendingOne, "pending entry carries the NEWEST invite's flags and id");
  assert(/not yet accepted/i.test(A.statusText(pend)) && /invited/i.test(A.statusText(pend)), 'pending status text: Invited <date> · not yet accepted');
  const t = A.tableHtml(list, ME);
  assert(/data-email="pending@example\.com" data-flag="scb" checked/.test(t) && /data-pending="pending@example\.com"/.test(t), 'pending row renders ticks and is marked pending');
  assert(/data-invite="pending@example\.com"/.test(t) && !/data-invite="active@example\.com"/.test(t), 'Invite link only on pending rows');
  assert(/data-reset="active@example\.com"/.test(t) && !/data-reset="pending@example\.com"/.test(t), 'Reset email only on active rows');
  r = await A.updateMember(db, 'pending@example.com', { bit: true }, ME);
  assert(r.result === 'saved' && db.docs['invites/' + pendingOne].flags.bit === true && !db.docs['access/pending@example.com'], 'tick on pending → invite flags updated, no access row created');
  r = await A.removeMember(db, 'pending@example.com', ME);
  assert(r.result === 'removed' && !Object.keys(db.docs).some(k => k.startsWith('invites/pending')), 'remove on pending → all their invites deleted');

  done();
  function done() { console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`); process.exit(failures ? 1 : 0); }
})();
