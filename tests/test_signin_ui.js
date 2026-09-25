// Regression: when a signed-in account is turned away (not on this band's list) or the check errors,
// the Sign In button must be re-enabled and relabelled, and the error shown; on success the error hides.
// Bug seen 2026-09-25: button stuck on "Signing in…" after denial.
const fs = require('fs'), path = require('path');
const PAGES = ['index.html', 'second-chance/index.html', 'back-in-time/index.html'];
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function ui() { return { btn: { disabled: true, textContent: 'Signing in…' }, error: { style: { display: 'none' }, textContent: '' }, login: { style: {} }, dashboard: { style: {} } }; }
for (const page of PAGES) {
  console.log(page);
  const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  const m = html.match(/\/\/ ── SIGN-IN UI ──[\s\S]*?\/\/ ── END SIGN-IN UI ──/);
  assert(m, 'sign-in UI block present'); if (!m) continue;
  const window = {}; new Function('window', m[0])(window);
  const U = window.smbSignInUi; assert(U && typeof U.denied === 'function', 'smbSignInUi.denied defined'); if (!U) continue;
  let u = ui(); U.denied(u, 'not-member', 'Test Band');
  assert(u.btn.disabled === false && u.btn.textContent === 'Sign In', 'denied → Sign In button re-enabled and relabelled');
  assert(u.error.style.display === 'block' && /Test Band members list/.test(u.error.textContent), 'denied → band-specific message shown');
  assert(u.login.style.display === '' && u.dashboard.style.display === 'none', 'denied → login screen shown, dashboard hidden');
  u = ui(); U.denied(u, 'error', 'Test Band');
  assert(u.btn.disabled === false && /try again/i.test(u.error.textContent) && !/members list/.test(u.error.textContent), 'error → button reset, retry message, not the not-member message');
  u = ui(); u.error.style.display = 'block'; U.allowed(u);
  assert(u.btn.disabled === false && u.btn.textContent === 'Sign In' && u.error.style.display === 'none', 'allowed → button reset and error hidden');
  assert(u.login.style.display === 'none' && u.dashboard.style.display === 'block', 'allowed → dashboard shown');
  u = ui(); u.btn = null; U.denied(u, 'not-member', 'X'); U.allowed(u); assert(true, 'missing button element does not throw');
}
console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks across ${PAGES.length} pages`);
process.exit(failures ? 1 : 0);
