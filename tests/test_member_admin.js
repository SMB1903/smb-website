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
    if (c !== 'access') throw new Error('unexpected collection ' + c);
    return {
      get() { log.push('list'); const arr = Object.keys(docs).sort().map(id => ({ id, data: () => docs[id] })); return Promise.resolve({ forEach: f => arr.forEach(f), docs: arr, size: arr.length }); },
      doc(id) { return {
        set(d) { log.push('set ' + id); docs[id] = d; return Promise.resolve(); },
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

  // random password: long and different each time
  const p1 = A.randomPassword(), p2 = A.randomPassword();
  assert(p1.length >= 24 && p1 !== p2, 'randomPassword is long and unique');

  // add: invalid email → nothing touched
  let db = fakeDb({}), h = fakeHelper();
  let r = await A.addMember(db, h, 'not an email', { smb: true }, ME);
  assert(r.result === 'invalid' && db.log.length === 0 && h.log.length === 0, 'invalid email → invalid, nothing written or created');

  // add: happy path → doc written (lowercased id), account created with random pw, reset email sent, helper signed out
  db = fakeDb({}); h = fakeHelper();
  r = await A.addMember(db, h, '  Jane.Doe@Example.com ', { smb: true, bit: true }, ME);
  assert(r.result === 'invited', 'happy path → invited');
  assert(db.docs['jane.doe@example.com'] && db.docs['jane.doe@example.com'].smb === true && db.docs['jane.doe@example.com'].scb === false, 'doc stored under lowercased email with strict flags');
  assert(h.log[0].startsWith('create jane.doe@example.com pwlen=') && parseInt(h.log[0].split('pwlen=')[1]) >= 24, 'account created with a long random password');
  assert(h.log.includes('reset jane.doe@example.com') && h.log[h.log.length - 1] === 'signout', 'set-password email sent, helper signed out last');

  // add: account already exists → doc still written, reset still sent, reported as existing
  db = fakeDb({}); h = fakeHelper(err('auth/email-already-in-use'));
  r = await A.addMember(db, h, 'bob@example.com', { scb: true }, ME);
  assert(r.result === 'existing' && db.docs['bob@example.com'] && h.log.includes('reset bob@example.com'), 'existing account → access granted + reset email, reported as existing');

  // add: sign-up disabled in Firebase → doc kept, admin told what to flip, no reset attempted
  db = fakeDb({}); h = fakeHelper(err('auth/admin-restricted-operation'));
  r = await A.addMember(db, h, 'c@example.com', { smb: true }, ME);
  assert(r.result === 'signup-disabled' && /sign-up/i.test(r.message) && db.docs['c@example.com'], 'sign-up disabled → clear message, access row kept');
  db = fakeDb({}); h = fakeHelper(err('auth/operation-not-allowed'));
  r = await A.addMember(db, h, 'c2@example.com', { smb: true }, ME);
  assert(r.result === 'signup-disabled', 'operation-not-allowed also → signup-disabled');

  // add: reset email fails → account exists but admin is told to use Resend
  db = fakeDb({}); h = fakeHelper(null, err('auth/network-request-failed'));
  r = await A.addMember(db, h, 'd@example.com', { smb: true }, ME);
  assert(r.result === 'email-failed' && /resend/i.test(r.message), 'reset email failure → email-failed with resend hint');

  // add: doc write fails → stop before creating any account
  db = fakeDb({}); db.collection = () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }), set: () => Promise.reject(new Error('permission-denied')) }) }); h = fakeHelper();
  r = await A.addMember(db, h, 'e@example.com', { smb: true }, ME);
  assert(r.result === 'error' && h.log.length === 0, 'doc write failure → error, no account created');

  // add: duplicate of an existing row → refuse (edit instead), nothing created
  db = fakeDb({ 'jane.doe@example.com': { smb: true, scb: false, bit: false, admin: false } }); h = fakeHelper();
  r = await A.addMember(db, h, 'jane.doe@example.com', { smb: true }, ME);
  assert(r.result === 'duplicate' && h.log.length === 0, 'existing row → duplicate, nothing created');

  // update: strict flags; cannot remove own admin
  db = fakeDb({ [ME]: { smb: true, scb: false, bit: false, admin: true } });
  r = await A.updateMember(db, ME, { smb: true, admin: false }, ME);
  assert(r.result === 'self-admin' && db.docs[ME].admin === true, 'cannot remove own admin flag');
  r = await A.updateMember(db, 'x@example.com', { smb: 'true', scb: true }, ME);
  assert(r.result === 'saved' && db.docs['x@example.com'].smb === false && db.docs['x@example.com'].scb === true, 'update stores strict booleans');

  // remove: cannot remove self; removes others
  db = fakeDb({ [ME]: { admin: true }, 'y@example.com': { smb: true } });
  r = await A.removeMember(db, ME, ME); assert(r.result === 'self' && db.docs[ME], 'cannot remove own row');
  r = await A.removeMember(db, 'y@example.com', ME); assert(r.result === 'removed' && !db.docs['y@example.com'], 'other row removed');

  // resend
  h = fakeHelper(); r = await A.resendInvite(h, 'z@example.com'); assert(r.result === 'sent' && h.log[0] === 'reset z@example.com', 'resend sends reset email');
  h = fakeHelper(null, err('auth/network-request-failed')); r = await A.resendInvite(h, 'z@example.com'); assert(r.result === 'error', 'resend failure → error');

  // list + table rendering
  db = fakeDb({ 'b@example.com': { smb: true, scb: false, bit: true, admin: false }, 'a<script>@example.com': { smb: false } });
  const list = await A.listMembers(db);
  assert(list.length === 2 && list[0].email === 'a<script>@example.com', 'listMembers sorted by email');
  const t = A.tableHtml(list, 'b@example.com');
  assert(t.includes('a&lt;script&gt;@example.com') && !t.includes('a<script>'), 'emails are HTML-escaped');
  assert((t.match(/type="checkbox"/g) || []).length === 8, 'four checkboxes per row');
  assert(/data-email="b@example\.com" data-flag="bit" checked/.test(t) && /data-email="b@example\.com" data-flag="scb"(?! checked)/.test(t), 'checkboxes reflect flags');
  assert(/data-remove="a&lt;script&gt;@example.com"/.test(t) && !/data-remove="b@example\.com"/.test(t), 'remove control present for others, absent for self');

  done();
  function done() { console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`); process.exit(failures ? 1 : 0); }
})();
