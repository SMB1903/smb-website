// Large uploads: smbFiles splits a file (base64) across several Firestore records (≤ 1 MiB each) and joins it back.
// Drives the SMB FILES block on all three pages with a fake Firestore.
const fs = require('fs'), path = require('path');
const PAGES = ['index.html', 'second-chance/index.html', 'back-in-time/index.html'];
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function store(failSetAt) {
  const docs = {}; let sets = 0;
  const partDoc = (s, k) => { const key = s + '/' + k; return {
    set(d) { sets++; if (failSetAt && sets === failSetAt) return Promise.reject(new Error('net')); docs[key] = d; return Promise.resolve(); },
    get() { return Promise.resolve({ exists: key in docs, data: () => docs[key] }); },
    delete() { delete docs[key]; return Promise.resolve(); } }; };
  return { docs, partDoc };
}
(async () => {
  const blocks = [];
  for (const page of PAGES) {
    console.log(page);
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const m = html.match(/\/\/ ── SMB FILES ──[\s\S]*?\/\/ ── END SMB FILES ──/);
    assert(m, 'SMB FILES block present'); if (!m) continue;
    blocks.push(m[0].replace(/^ +/gm, ''));
    const window = {}; new Function('window', m[0])(window);
    const F = window.smbFiles; assert(F && typeof F.writeParts === 'function', 'smbFiles defined'); if (!F) continue;

    assert(F.MAX === 5 * 1024 * 1024, 'limit is 5 MB');
    assert(F.PIECE + 4000 < 1048576, 'each piece fits in one Firestore record with room for the other fields');
    assert(Math.ceil(Math.ceil(F.MAX / 3) * 4 / F.PIECE) <= F.MAX_PARTS, 'a 5 MB file needs no more pieces than MAX_PARTS');

    // property: any length splits into pieces ≤ PIECE that join back to the original
    let ok = true;
    for (const len of [0, 1, F.PIECE - 1, F.PIECE, F.PIECE + 1, 3 * F.PIECE + 7]) {
      const s = 'QUJD'.repeat(Math.ceil(len / 4)).slice(0, len), parts = F.split(s);
      if (parts.join('') !== s || parts.some(p => p.length > F.PIECE) || parts.length !== Math.max(1, Math.ceil(len / F.PIECE))) ok = false;
    }
    assert(ok, 'split: pieces ≤ PIECE and join back to the original (boundary lengths)');

    // write + read round trip, multi-piece
    const big = 'QUJD'.repeat(Math.ceil((2 * F.PIECE + 10) / 4));
    let st = store(), main = await F.writeParts(st.partDoc, big, 's1');
    assert(main.fileParts === 3 && main.fileStamp === 's1' && main.fileData.length === F.PIECE && Object.keys(st.docs).length === 2, 'writeParts: first piece returned for the main record, the rest written as parts');
    assert(await F.readParts(st.partDoc, main) === big, 'readParts: multi-piece file read back whole');
    assert(await F.readParts(st.partDoc, { fileData: 'iVBORw0KGgo=' }) === 'iVBORw0KGgo=', 'readParts: old single-record file still reads');
    delete st.docs['s1/2'];
    assert(await F.readParts(st.partDoc, main) === null, 'readParts: a missing piece → null, never a corrupt file');
    assert(await F.readParts(st.partDoc, { fileData: 'x', fileParts: 99, fileStamp: 's1' }) === null, 'readParts: absurd piece count refused');
    assert(await F.readParts(() => ({ get: () => Promise.reject(new Error('denied')) }), main) === null, 'readParts: denied → null');

    // failure part-way: nothing returned for the main record, so the caller never points at a half file
    st = store(2); let threw = false;
    try { await F.writeParts(st.partDoc, big, 's2'); } catch (e) { threw = true; }
    assert(threw, 'writeParts: a failed piece rejects (caller keeps the old file)');

    // clean-up
    st = store(); main = await F.writeParts(st.partDoc, big, 's3');
    await F.deleteParts(st.partDoc, main);
    assert(Object.keys(st.docs).length === 0, 'deleteParts removes every extra piece');
    await F.deleteParts(st.partDoc, { fileData: 'x' }); await F.deleteParts(st.partDoc, null);
    assert(true, 'deleteParts: single-record or missing file is a no-op');
  }
  assert(blocks.length === 3 && blocks.every(b => b === blocks[0]), 'SMB FILES block identical on all three pages');
  console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`);
  process.exit(failures ? 1 : 0);
})();
