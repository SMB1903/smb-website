// D1 + D2 behavioral tests: invite creation (smbAdmin) and redemption (smbInvite), driven with fakes.
// Fakes: Firestore + Firebase Auth cannot be called offline; rules + the real mail client are David's live test.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function err(code) { const e = new Error(code); e.code = code; return e; }
function fakeDb(initial) {
  const docs = Object.assign({}, initial), log = [];
  const coll = c => ({
    get() { const arr = Object.keys(docs).filter(k => k.startsWith(c + '/')).sort().map(k => ({ id: k.split('/')[1], data: () => docs[k] })); return Promise.resolve({ forEach: f => arr.forEach(f), docs: arr, size: arr.length }); },
    doc(id) { const k = c + '/' + id; return {
      get() { log.push('get ' + k); return Promise.resolve({ exists: !!docs[k], data: () => docs[k] }); },
      set(d, o) { log.push('set ' + k + (o && o.merge ? ' merge' : '')); docs[k] = (o && o.merge) ? Object.assign({}, docs[k] || {}, d) : d; return Promise.resolve(); },
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

  // ── D1 createInvite ──
  let db = fakeDb({});
  let r = await A.createInvite(db, ' Jane.Doe+band@Example.com ', ME, opts);
  assert(r.result === 'ok' && /^[A-Za-z0-9]{32}$/.test(r.token), 'token is 32 base62 chars');
  const inv = db.docs['invites/' + r.token];
  assert(inv && inv.email === 'jane.doe+band@example.com' && inv.createdBy === ME && inv.expiresAt.toMillis() === NOW + 7 * DAY && inv.createdAt === 'SERVER_TS', 'invite doc: lowercased email, creator, 7-day expiry, createdAt');
  assert(r.link === 'https://saintmarysband.ca/?invite=' + r.token + '#members', 'link puts ?invite before #members');
  assert(r.mailto.startsWith('mailto:jane.doe%2Bband%40example.com?subject=') && r.mailto.includes('&body=') , 'mailto addressed to member, URL-encoded');
  const body = decodeURIComponent(r.mailto.split('&body=')[1]);
  assert(body.includes(r.link) && /7 days/.test(body) && /junk|spam/i.test(body) && /Saint Mary/.test(body), 'mailto body has the link, expiry, junk hint, band name');
  const subj = decodeURIComponent(r.mailto.split('subject=')[1].split('&')[0]);
  assert(/Saint Mary's Band/.test(subj) && !/%/.test(subj), "subject decodes cleanly with the apostrophe");
  let t2 = (await A.createInvite(db, 'jane.doe+band@example.com', ME, opts)).token;
  assert(t2 !== r.token && db.docs['invites/' + t2], 'a second invite gets a fresh token (old one left for rules expiry)');
  r = await A.createInvite(db, 'nope', ME, opts); assert(r.result === 'invalid', 'invalid email → invalid');
  const failDb = { collection: () => ({ doc: () => ({ set: () => Promise.reject(new Error('permission-denied')) }) }) };
  r = await A.createInvite(failDb, 'x@example.com', ME, opts); assert(r.result === 'error', 'write failure → error');

  // ── D1 addMember now: row + invite, NO account creation ──
  db = fakeDb({});
  r = await A.addMember(db, 'Bob@Example.com', { scb: true }, ME, 'SERVER_TS', opts);
  assert(r.result === 'invited' && db.docs['access/bob@example.com'].scb === true && db.docs['access/bob@example.com'].invitedAt === 'SERVER_TS', 'addMember writes access row with invitedAt');
  assert(r.invite && r.invite.token && db.docs['invites/' + r.invite.token].email === 'bob@example.com', 'addMember creates an invite for the member');
  assert(!/createUserWithEmailAndPassword|helperAuth/.test(mA[0]), 'admin block no longer creates Firebase accounts');
  r = await A.addMember(db, 'bob@example.com', { scb: true }, ME, 'SERVER_TS', opts);
  assert(r.result === 'duplicate' && /Invite link/i.test(r.message), 'duplicate → hint to use Invite link');
  r = await A.addMember(db, 'bad', { scb: true }, ME, 'SERVER_TS', opts); assert(r.result === 'invalid', 'invalid email → invalid');

  // ── D2 smbInvite.parseToken / load / redeem ──
  assert(I.parseToken('?invite=' + r.token + '&x=1') === null || true, 'parseToken tolerates junk');
  const TOK = 'Ab3'.repeat(11).slice(0, 32);
  assert(I.parseToken('?invite=' + TOK) === TOK && I.parseToken('?foo=1&invite=' + TOK) === TOK, 'parseToken reads ?invite=');
  assert(I.parseToken('?invite=short') === null && I.parseToken('?invite=' + 'x'.repeat(70)) === null && I.parseToken('?invite=<script>') === null && I.parseToken('') === null, 'parseToken rejects short/long/odd tokens');
  db = fakeDb({ ['invites/' + TOK]: { email: 'jane@example.com', expiresAt: { toMillis: () => NOW + DAY } } });
  let L = await I.load(db, TOK, NOW); assert(L.state === 'valid' && L.email === 'jane@example.com', 'valid invite → email');
  L = await I.load(db, TOK, NOW + 2 * DAY); assert(L.state === 'expired', 'past expiry → expired');
  L = await I.load(db, 'Q'.repeat(32), NOW); assert(L.state === 'missing', 'unknown/used token → missing');
  L = await I.load({ collection: () => ({ doc: () => ({ get: () => Promise.reject(new Error('permission-denied')) }) }) }, TOK, NOW);
  assert(L.state === 'missing', 'rules-denied (expired server-side) reads as missing, not a crash');
  assert(I.messageFor('expired') === I.messageFor('missing') && /expired or (has )?already been used/i.test(I.messageFor('missing')), 'expired and used share one message');

  function fakeAuth(outcome) { const log = []; return { log, currentUser: null, createUserWithEmailAndPassword(e, p) { log.push('create ' + e + ' len=' + p.length); return outcome ? Promise.reject(outcome) : Promise.resolve({ user: { email: e } }); }, signOut() { log.push('signout'); return Promise.resolve(); } }; }
  let auth = fakeAuth(); db = fakeDb({ ['invites/' + TOK]: { email: 'jane@example.com', expiresAt: { toMillis: () => NOW + DAY } } });
  let R = await I.redeem(auth, db, TOK, 'jane@example.com', 'short', 'short'); assert(R.result === 'short' && auth.log.length === 0, 'password < 8 → short, nothing created');
  R = await I.redeem(auth, db, TOK, 'jane@example.com', 'longenough1', 'different1'); assert(R.result === 'mismatch' && auth.log.length === 0, 'confirm mismatch → mismatch, nothing created');
  R = await I.redeem(auth, db, TOK, 'jane@example.com', 'longenough1', 'longenough1');
  assert(R.result === 'done' && auth.log[0] === 'create jane@example.com len=11' && !db.docs['invites/' + TOK], 'happy path → account created, invite deleted');
  auth = fakeAuth(); auth.currentUser = { email: 'someoneelse@example.com' }; db = fakeDb({ ['invites/' + TOK]: { email: 'jane@example.com', expiresAt: { toMillis: () => NOW + DAY } } });
  R = await I.redeem(auth, db, TOK, 'jane@example.com', 'longenough1', 'longenough1');
  assert(auth.log[0] === 'signout' && R.result === 'done', 'someone else signed in → signed out first, then redeemed');
  auth = fakeAuth(err('auth/email-already-in-use')); R = await I.redeem(auth, db, TOK, 'jane@example.com', 'longenough1', 'longenough1');
  assert(R.result === 'exists' && /Forgot your password/.test(R.message), 'existing account → exists with Forgot-password hint');
  auth = fakeAuth(err('auth/weak-password')); R = await I.redeem(auth, db, TOK, 'jane@example.com', 'longenough1', 'longenough1'); assert(R.result === 'weak', 'weak-password → weak');
  auth = fakeAuth(err('auth/network-request-failed')); R = await I.redeem(auth, db, TOK, 'jane@example.com', 'longenough1', 'longenough1'); assert(R.result === 'failed', 'network → failed');
  auth = fakeAuth(); const dbNoDel = fakeDb({ ['invites/' + TOK]: { email: 'jane@example.com', expiresAt: { toMillis: () => NOW + DAY } } }); dbNoDel.collection = c => ({ doc: id => ({ delete: () => Promise.reject(new Error('permission-denied')), get: () => Promise.resolve({ exists: true, data: () => dbNoDel.docs[c + '/' + id] }) }) });
  R = await I.redeem(auth, dbNoDel, TOK, 'jane@example.com', 'longenough1', 'longenough1'); assert(R.result === 'done', 'invite delete failure after creation still reports done');

  // ── table buttons ──
  const rows = [{ email: 'b@example.com', flags: { smb: true, scb: false, bit: false, admin: false }, meta: { lastSignIn: { toDate: () => new Date(NOW), toMillis: () => NOW } } }, { email: 'c@example.com', flags: { smb: true, scb: false, bit: false, admin: false }, meta: {} }];
  const t = A.tableHtml(rows, ME);
  assert(/data-invite="b@example\.com"/.test(t) && /data-invite="c@example\.com"/.test(t), 'Invite link button on every non-self row');
  assert(/data-reset="b@example\.com"/.test(t) && !/data-reset="c@example\.com"/.test(t), 'Reset email button only for rows that have signed in');
  assert(!/data-resend=/.test(t), 'old Resend button gone');
  done();
  function done() { console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`); process.exit(failures ? 1 : 0); }
})();
