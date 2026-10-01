// Behavioral test for the members Admin tab logic (window.smbAdmin) on index.html.
// Fakes: Firestore (cannot be called offline) and the helper Firebase Auth app used to create
// accounts (creating real accounts in a test is not acceptable). Rules + real flow are David's live test.
// Run: node tests/test_member_admin.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function err(code) { const e = new Error(code); e.code = code; return e; }
function fakeDb(initial) {
  const docs = Object.assign({}, initial), log = [];
  return { docs, log, collection(c) {
    if (c === 'invites') { return { where() { return { get() { return Promise.resolve({ forEach() {}, docs: [], empty: true }); } }; }, get() { return Promise.resolve({ forEach() {}, docs: [] }); }, doc(id) { return { set(d) { log.push('invite ' + id); docs['invites/' + id] = d; return Promise.resolve(); } }; } }; }
    if (c !== 'access') throw new Error('unexpected collection ' + c);
    return {
      get() { log.push('list'); const arr = Object.keys(docs).sort().map(id => ({ id, data: () => docs[id] })); return Promise.resolve({ forEach: f => arr.forEach(f), docs: arr, size: arr.length }); },
      doc(id) { return {
        set(d, opts) { log.push('set ' + id + (opts && opts.merge ? ' merge' : '') + ' keys=' + Object.keys(d).sort().join(',')); docs[id] = (opts && opts.merge) ? Object.assign({}, docs[id] || {}, d) : d; return Promise.resolve(); },
        delete() { log.push('delete ' + id); delete docs[id]; return Promise.resolve(); },
        get() { return Promise.resolve({ exists: !!docs[id], data: () => docs[id] }); } }; } }; } };
}
function fakeHelper(createOutcome, resetOutcome) {
  const log = [];
  return { log,
    createUserWithEmailAndPassword(e, p) { log.push('create ' + e + ' pwlen=' + p.length); return createOutcome ? Promise.reject(createOutcome) : Promise.resolve({ user: { email: e } }); },
    sendPasswordResetEmail(e) { log.push('reset ' + e); return resetOutcome ? Promise.reject(resetOutcome) : Promise.resolve(); },
    signOut() { log.push('signout'); return Promise.resolve(); } };
}
(async () => {
  const m = html.match(/\/\/ ── MEMBER ADMIN ──[\s\S]*?\/\/ ── END MEMBER ADMIN ──/);
  assert(m, 'member-admin block present'); if (!m) return done();
  const window = {}; new Function('window', m[0])(window);
  const A = window.smbAdmin; assert(A && typeof A.addMember === 'function', 'smbAdmin.addMember defined'); if (!A) return done();
  const ME = 'admin@example.com';

  // flags are strict booleans, nothing else stored
  const f = A.normalizeFlags({ smb: 'yes', scb: true, admin: 1, extra: true });
  assert(JSON.stringify(f) === JSON.stringify({ smb: false, scb: true, bit: false, admin: false }), 'normalizeFlags → exactly four strict booleans');

  // invitation tokens: secure RNG or refuse (no Math.random fallback); createInvite reports it as an error
  const t1 = A.randomToken(), t2 = A.randomToken();
  assert(/^[A-Za-z0-9]{32}$/.test(t1) && t1 !== t2, 'randomToken is 32 base62 chars and unique');
  { const w2 = {}; new Function('window', 'crypto', html.match(/\/\/ ── MEMBER ADMIN ──[\s\S]*?\/\/ ── END MEMBER ADMIN ──/)[0])(w2, undefined);
    let threw = false; try { w2.smbAdmin.randomToken(); } catch (e) { threw = true; }
    assert(threw, 'randomToken refuses to run without crypto.getRandomValues');
    const IO0 = { nowMs: 1, ttlMs: 7 * 86_400_000, siteUrl: 'https://x', makeExpiry: ms => ms, createdAt: 'TS' };
    const r0 = await w2.smbAdmin.createInvite(fakeDb({}), 'a@example.com', { smb: true }, 'me@example.com', IO0);
    assert(r0.result === 'error' && /Secure random/.test(r0.message), 'createInvite without secure RNG → error result, no throw'); }

  // add (2026-09-30 invite model): row + invite; no Firebase account creation here
  const IO = { nowMs: 1_800_000_000_000, ttlMs: 7 * 86_400_000, siteUrl: 'https://saintmarysband.ca', makeExpiry: ms => ({ toMillis: () => ms }), createdAt: 'SERVER_TS' };
  let db = fakeDb({});
  let r = await A.addMember(db, 'not an email', { smb: true }, ME, 'SERVER_TS', IO);
  assert(r.result === 'invalid' && db.log.length === 0, 'invalid email → invalid, nothing written');
  db = fakeDb({});
  r = await A.addMember(db, '  Jane.Doe@Example.com ', { smb: true, bit: true }, ME, IO);
  assert(r.result === 'invited', 'happy path → invited');
  assert(!db.docs['jane.doe@example.com'] && db.docs['invites/' + r.invite.inviteId].email === 'jane.doe@example.com' && db.docs['invites/' + r.invite.inviteId].flags.bit === true, 'no access row yet; the invite carries the flags');
  assert(r.invite && r.invite.link.indexOf('?invite=' + r.invite.inviteId) > 0, 'result carries the invitation link');
  db = fakeDb({ 'jane.doe@example.com': { smb: true, scb: false, bit: false, admin: false } });
  r = await A.addMember(db, 'jane.doe@example.com', { smb: true }, ME, IO);
  assert(r.result === 'duplicate', 'existing row → duplicate');
  db = fakeDb({}); db.collection = () => ({ where: () => ({ get: () => Promise.resolve({ forEach() {}, docs: [], empty: true }) }), doc: () => ({ get: () => Promise.resolve({ exists: false }), set: () => Promise.reject(new Error('permission-denied')) }) });
  r = await A.addMember(db, 'e@example.com', { smb: true }, ME, IO);
  assert(r.result === 'error', 'invite write failure → error');

  // update: strict flags; cannot remove own admin
  db = fakeDb({ [ME]: { smb: true, scb: false, bit: false, admin: true } });
  r = await A.updateMember(db, ME, { smb: true, admin: false }, ME);
  assert(r.result === 'self-admin' && db.docs[ME].admin === true, 'cannot remove own admin flag');
  db = fakeDb({ [ME]: { smb: true, scb: false, bit: false, admin: true }, 'x@example.com': { smb: true, scb: false, bit: false, admin: false } });
  r = await A.updateMember(db, 'x@example.com', { smb: 'true', scb: true }, ME);
  assert(r.result === 'saved' && db.docs['x@example.com'].smb === false && db.docs['x@example.com'].scb === true, 'update stores strict booleans');

  // F6 (audit #2): a tick must write ONLY the changed flag, as a merge — never the whole row from a possibly stale view.
  db = fakeDb({ 'bob@example.com': { smb: true, scb: false, bit: false, admin: false } });  // another admin already removed Bob's admin
  r = await A.updateMember(db, 'bob@example.com', { scb: true }, ME);
  assert(r.result === 'saved', 'single-flag update saves');
  assert(db.log[db.log.length - 1] === 'set bob@example.com merge keys=scb', 'writes exactly the changed flag with merge: ' + db.log[db.log.length - 1]);
  assert(db.docs['bob@example.com'].admin === false && db.docs['bob@example.com'].smb === true, 'untouched flags keep their current stored values');
  r = await A.updateMember(db, 'bob@example.com', { bogus: true }, ME);
  assert(r.result === 'error', 'unknown flag name is rejected');
  r = await A.updateMember(db, ME, { admin: false }, ME);
  assert(r.result === 'self-admin', 'self-demote still blocked with partial writes');

  // remove: cannot remove self; removes others
  db = fakeDb({ [ME]: { admin: true }, 'y@example.com': { smb: true } });
  r = await A.removeMember(db, ME, ME); assert(r.result === 'self' && db.docs[ME], 'cannot remove own row');
  r = await A.removeMember(db, 'y@example.com', ME); assert(r.result === 'removed' && !db.docs['y@example.com'], 'other row removed');
  assert(/login/i.test(r.message) && /Firebase/.test(r.message) && /Delete account/.test(r.message), 'remove message says the Firebase login still exists and how to delete it');

  // resend
  let h = fakeHelper(); r = await A.sendResetEmail(h, 'Z@example.com'); assert(r.result === 'sent' && h.log[0] === 'reset z@example.com', 'Reset email sends a Firebase reset to the lowercased address');
  h = fakeHelper(null, err('auth/network-request-failed')); r = await A.sendResetEmail(h, 'z@example.com'); assert(r.result === 'error', 'reset failure → error');

  // status text: never / invited-never / last signed in
  const T = ms => ({ toDate: () => new Date(ms), toMillis: () => ms });
  const D1 = Date.UTC(2026, 8, 24, 12), D2 = Date.UTC(2026, 8, 25, 12);
  assert(/never signed in/i.test(A.statusText({})) && !/invited/i.test(A.statusText({})), 'no stamps → "Never signed in"');
  assert(/invited/i.test(A.statusText({ invitedAt: T(D1) })) && /never signed in/i.test(A.statusText({ invitedAt: T(D1) })) && /2026/.test(A.statusText({ invitedAt: T(D1) })), 'invited, no sign-in → "Invited <date> · never signed in"');
  const st = A.statusText({ invitedAt: T(D1), lastSignIn: T(D2) });
  assert(/last signed in/i.test(st) && /25/.test(st) && !/never/i.test(st), 'signed in → "Last signed in <date>"');
  assert(typeof A.statusText({ lastSignIn: 'garbage' }) === 'string', 'malformed stamp does not throw');

  // list + table rendering
  db = fakeDb({ 'b@example.com': { smb: true, scb: false, bit: true, admin: false, lastSignIn: { toDate: () => new Date(Date.UTC(2026, 8, 25)), toMillis: () => Date.UTC(2026, 8, 25) } }, 'a<script>@example.com': { smb: false } });
  const list = await A.listMembers(db);
  assert(list.length === 2 && list[0].email === 'a<script>@example.com', 'listMembers sorted by email');
  const t = A.tableHtml(list, 'b@example.com');
  assert(t.includes('a&lt;script&gt;@example.com') && !t.includes('a<script>'), 'emails are HTML-escaped');
  assert((t.match(/type="checkbox"/g) || []).length === 8, 'four checkboxes per row');
  assert(/<th>Status<\/th>/.test(t) && /Last signed in/.test(t) && /Never signed in/.test(t), 'Status column rendered with per-row text');
  assert(list[1].meta && list[1].meta.lastSignIn, 'listMembers exposes stamps as meta');
  assert(/data-email="b@example\.com" data-flag="bit" checked/.test(t) && /data-email="b@example\.com" data-flag="scb"(?! checked)/.test(t), 'checkboxes reflect flags');
  assert(/data-remove="a&lt;script&gt;@example.com"/.test(t) && !/data-remove="b@example\.com"/.test(t), 'remove control present for others, absent for self');

  done();
  function done() { console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`); process.exit(failures ? 1 : 0); }
})();
