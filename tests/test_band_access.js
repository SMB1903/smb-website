// Behavioral test for per-band access (the `access` list keyed by email with smb/scb/bit flags).
// Extracts the BAND ACCESS block from each portal page and drives it with a fake Firestore.
// Fake justification: Firestore cannot be called offline; the rules + live sign-in are exercised by David's test.
// Run: node tests/test_band_access.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PAGES = [['index.html', 'smb'], ['second-chance/index.html', 'scb'], ['back-in-time/index.html', 'bit']];
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function fakeDb(docsByPath, fail) {
  const gets = [];
  return { gets, collection(c) { return { doc(id) { const p = c + '/' + id; return { get() { gets.push(p); if (fail) return Promise.reject(new Error('permission-denied')); const d = docsByPath[p]; return Promise.resolve({ exists: !!d, data: () => d }); } }; } }; } };
}
(async () => {
  for (const [page, band] of PAGES) {
    console.log(page);
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = html.match(/\/\/ ── BAND ACCESS ──[\s\S]*?\/\/ ── END BAND ACCESS ──/);
    assert(m, 'band-access block present'); if (!m) continue;
    const window = {}; new Function('window', m[0])(window);
    const A = window.smbAccess; assert(A && typeof A.check === 'function', 'smbAccess.check defined'); if (!A) continue;

    assert(A.emailKey('  Jane.Doe@Example.COM ') === 'jane.doe@example.com', 'emailKey trims + lowercases');
    assert(A.canAccess({ smb: true }, 'smb') === true, 'flag true → allowed');
    assert(A.canAccess({ smb: 'true' }, 'smb') === false, 'string "true" is NOT allowed (strict boolean)');
    assert(A.canAccess({ smb: 1 }, 'smb') === false, 'number 1 is NOT allowed');
    assert(A.canAccess({ scb: true }, 'smb') === false, 'other band flag does not grant');
    assert(A.canAccess(null, 'smb') === false && A.canAccess(undefined, 'smb') === false, 'no data → not allowed');

    const bands = A.bandsFor({ smb: true, bit: true, scb: false });
    assert(bands.map(b => b.key).join(',') === 'smb,bit', 'bandsFor lists only true flags, in canonical order');
    assert(A.bandsFor({}).length === 0 && A.bandsFor(null).length === 0, 'bandsFor empty on no flags');

    const h = A.yourBandsHtml({ smb: true, scb: true, bit: true }, band);
    assert(/Your bands/i.test(h), 'yourBands has a label');
    A.BANDS.filter(b => b.key !== band).forEach(b => assert(h.includes('href="' + b.portal + '"'), 'other band ' + b.key + ' is a link to its portal'));
    assert(!/coming soon/i.test(h), 'no band is marked coming soon any more');
    assert(A.BANDS.find(b => b.key === 'bit').portal === '/back-in-time/#members', 'Back in Time portal path');
    const cur = A.BANDS.find(b => b.key === band);
    assert(!new RegExp('href="' + cur.portal.replace(/[/#?]/g, '\\$&') + '"').test(h), 'current band is not linked to itself');
    assert(A.yourBandsHtml({ [band]: true }, band).indexOf('href=') === -1, 'single-band member sees no links');

    // check(): the seam the page gates on
    let db = fakeDb({ 'access/jane@example.com': { [band]: true, bit: true } });
    let r = await A.check(db, { email: 'Jane@Example.com' }, band);
    assert(r.allowed === true && r.reason === 'ok' && r.data.bit === true, 'approved user → allowed with data');
    assert(db.gets[0] === 'access/jane@example.com', 'lookup uses lowercased email as the doc id');
    db = fakeDb({ 'access/jane@example.com': { [band]: false } });
    r = await A.check(db, { email: 'jane@example.com' }, band);
    assert(r.allowed === false && r.reason === 'not-member', 'flag false → not-member');
    db = fakeDb({});
    r = await A.check(db, { email: 'nobody@example.com' }, band);
    assert(r.allowed === false && r.reason === 'not-member', 'no row → not-member');
    db = fakeDb({}, true);
    r = await A.check(db, { email: 'jane@example.com' }, band);
    assert(r.allowed === false && r.reason === 'error', 'lookup failure → error, distinguishable from not-member, never allowed');
    r = await A.check(db, { email: '' }, band);
    assert(r.allowed === false, 'account with no email → not allowed');
  }
  console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks across ${PAGES.length} pages`);
  process.exit(failures ? 1 : 0);
})();
