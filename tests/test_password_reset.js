// Behavioral test for the "Forgot your password?" flow on both portal pages.
// Extracts the smbPasswordReset function from each page's inline script and drives it with a
// fake Firebase auth object. Justification for the fake: the real Firebase endpoint cannot be
// called offline; the real seam is exercised by the live check (non-existent email → neutral).
// Run: node tests/test_password_reset.js   (exit 1 on any failure)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'second-chance/index.html'];
let failures = 0, checks = 0;
function assert(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL: ' + msg); } }

function extract(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const m = html.match(/\/\/ ── PASSWORD RESET ──[\s\S]*?\/\/ ── END PASSWORD RESET ──/);
  return m ? m[0] : null;
}
function ui() {
  const el = () => ({ textContent: '', style: {} });
  return { status: el(), link: Object.assign(el(), { textContent: 'Forgot your password?' }), okColor: 'ok', errorColor: 'err' };
}
function fakeAuth(outcome) {
  const calls = [];
  return { calls, sendPasswordResetEmail(email) { calls.push(email); return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(); } };
}
function err(code) { const e = new Error(code); e.code = code; return e; }

(async () => {
  for (const page of PAGES) {
    console.log(page);
    const src = extract(page);
    assert(src, 'password-reset block present between markers');
    if (!src) continue;
    const window = {};
    new Function('window', src)(window);
    const reset = window.smbPasswordReset;
    assert(typeof reset === 'function', 'smbPasswordReset defined');
    if (!reset) continue;

    // 1. empty email → told to fill it in, nothing sent
    let a = fakeAuth(), u = ui();
    assert(await reset(a, '   ', u) === 'empty', 'empty email → "empty"');
    assert(a.calls.length === 0, 'empty email sends nothing');
    assert(/email address/i.test(u.status.textContent) && u.status.style.display === 'block', 'empty email shows a prompt');

    // 2. success → neutral message
    a = fakeAuth(); u = ui();
    assert(await reset(a, ' member@example.com ', u) === 'sent', 'success → "sent"');
    assert(a.calls[0] === 'member@example.com', 'email is trimmed before sending');
    const neutral = u.status.textContent;
    assert(/if that email/i.test(neutral), 'success message is conditional/neutral');
    assert(u.link.textContent === 'Forgot your password?' && !u.link.style.pointerEvents, 'link re-enabled after send');

    // 3. unknown account → EXACT same message as success (no enumeration)
    a = fakeAuth(err('auth/user-not-found')); u = ui();
    assert(await reset(a, 'nobody@example.com', u) === 'sent', 'user-not-found reported as sent');
    assert(u.status.textContent === neutral, 'user-not-found message identical to success message');
    assert(u.status.style.color === 'ok', 'user-not-found not styled as an error');

    // 4. malformed email → specific, actionable message
    a = fakeAuth(err('auth/invalid-email')); u = ui();
    assert(await reset(a, 'not-an-email', u) === 'invalid', 'invalid-email → "invalid"');
    assert(/valid email/i.test(u.status.textContent) && u.status.style.color === 'err', 'invalid-email message is an error');

    // 5. throttled → wait message
    a = fakeAuth(err('auth/too-many-requests')); u = ui();
    assert(await reset(a, 'x@example.com', u) === 'throttled', 'too-many-requests → "throttled"');
    assert(/wait/i.test(u.status.textContent), 'throttled message says to wait');

    // 6. network/other failure → distinguishable from "sent" (caller can tell "it broke" from "worked")
    a = fakeAuth(err('auth/network-request-failed')); u = ui();
    assert(await reset(a, 'x@example.com', u) === 'failed', 'network failure → "failed"');
    assert(u.status.textContent !== neutral && u.status.style.color === 'err', 'network failure is not reported as sent');

    // 7. auth unavailable → told, nothing thrown
    u = ui();
    assert(await reset(null, 'x@example.com', u) === 'unavailable', 'missing auth → "unavailable"');

    // 8. link disabled while a send is in flight
    let resolveSend; const pending = { calls: [], sendPasswordResetEmail() { return new Promise(r => { resolveSend = r; }); } };
    u = ui(); const p = reset(pending, 'x@example.com', u);
    assert(u.link.style.pointerEvents === 'none' && u.link.textContent !== 'Forgot your password?', 'link disabled during send');
    resolveSend(); await p;
    assert(u.link.style.pointerEvents === '' , 'link restored after send');
  }
  console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks across ${PAGES.length} pages`);
  process.exit(failures ? 1 : 0);
})();
