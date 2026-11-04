// Delivery 2: concerts in the store, admin-editable. Drives the smbConcerts block (all three pages) with fakes.
const fs = require('fs'), path = require('path');
const PAGES = [['index.html', 'smb'], ['second-chance/index.html', 'scb'], ['back-in-time/index.html', 'bit']];
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function fakeDb(initial) {
  const docs = Object.assign({}, initial), log = []; let seq = 0;
  function snap(keys) { const arr = keys.sort().map(k => ({ id: k.split('/').pop(), data: () => docs[k] })); return { forEach: f => arr.forEach(f), docs: arr, size: arr.length, empty: arr.length === 0 }; }
  function coll(prefix) { return {
    get() { return Promise.resolve(snap(Object.keys(docs).filter(k => k.startsWith(prefix + '/') && k.split('/').length === prefix.split('/').length + 1))); },
    where(field, op, val) { return { get() { return Promise.resolve(snap(Object.keys(docs).filter(k => k.startsWith(prefix + '/') && docs[k][field] === val))); } }; },
    add(d) { const id = 'gen' + (++seq); docs[prefix + '/' + id] = d; log.push('add ' + prefix + '/' + id); return Promise.resolve({ id }); },
    doc(id) { const k = prefix + '/' + id; return { get() { return Promise.resolve({ exists: !!docs[k], id, data: () => docs[k] }); }, set(d) { docs[k] = d; return Promise.resolve(); }, update(d) { if (!docs[k]) return Promise.reject(new Error('nf')); Object.assign(docs[k], d); return Promise.resolve(); }, delete() { delete docs[k]; return Promise.resolve(); }, collection(sub) { return coll(k + '/' + sub); } }; } }; }
  return { docs, log, collection: c => coll(c) };
}
const K = 'content/concerts/items/';
(async () => {
  for (const [page, band] of PAGES) {
    console.log(page);
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const m = html.match(/\/\/ ── CONCERT STORE ──[\s\S]*?\/\/ ── END CONCERT STORE ──/);
    assert(m, 'CONCERT STORE block present'); if (!m) continue;
    const window = {}; const fm = html.match(/\/\/ ── SMB FILES ──[\s\S]*?\/\/ ── END SMB FILES ──/); if (fm) new Function('window', fm[0])(window);
    new Function('window', m[0])(window);
    const S = window.smbConcerts; assert(S && typeof S.load === 'function', 'smbConcerts defined'); if (!S) continue;

    let db = fakeDb({ [K + 'c1']: { band: band, date: '2026-12-01', title: 'Later', venue: 'V', time: '7:00 PM', tag: '', note: '', featured: false, posterUrl: '' },
                      [K + 'c2']: { band: band, date: '2026-11-01', title: 'Sooner', venue: 'V', time: '7:00 PM' },
                      [K + 'c3']: { band: band === 'smb' ? 'scb' : 'smb', date: '2026-10-15', title: 'Other band', venue: 'V', time: '1:00 PM' } });
    let items = await S.load(db, band);
    assert(items.map(i => i.title).join(',') === 'Sooner,Later', 'load: own band only, sorted by date ascending');
    assert(items[0].id === 'c2' && items[0].featured === false && items[0].posterUrl === '' && items[0].tag === '' && items[0].note === '', 'load: missing fields normalised');
    assert((await S.load({ collection: () => { throw new Error('x'); } }, band)).length === 0, 'load: broken db → empty, no throw');
    assert((await S.load({ collection: () => ({ doc: () => ({ collection: () => ({ where: () => ({ get: () => Promise.reject(new Error('denied')) }) }) }) }) }, band)).length === 0, 'load: denied → empty');

    // normalisation / validation
    let n = S.normalize({ date: '2026-12-25', title: ' Xmas ', venue: ' Hall ', time: '7 PM', tag: 'Free Admission', note: 'n', featured: 'yes', posterUrl: '../images/posters/p.png', address: '1 Main' });
    assert(n.ok && n.data.title === 'Xmas' && n.data.featured === false && n.data.posterUrl === '/images/posters/p.png' && n.data.address === '1 Main', 'normalize: trims, strict boolean featured, ../ poster → site path');
    assert(S.normalize({ date: '2026-13-40', title: 'T', venue: 'V' }).ok === false, 'normalize: impossible date refused');
    assert(S.normalize({ date: '12/25/2026', title: 'T', venue: 'V' }).ok === false, 'normalize: wrong date format refused');
    assert(S.normalize({ date: '2026-12-25', title: '', venue: 'V' }).ok === false && S.normalize({ date: '2026-12-25', title: 'T', venue: '' }).ok === false, 'normalize: title and venue required');
    assert(S.normalize({ date: '2026-12-25', title: 'T', venue: 'V', posterUrl: 'javascript:alert(1)' }).ok === false, 'normalize: javascript: poster refused');
    assert(S.normalize({ date: '2026-12-25', title: 'T', venue: 'V', posterUrl: 'https://example.com/p.jpg' }).ok === true && S.normalize({ date: '2026-12-25', title: 'T', venue: 'V', posterUrl: '' }).ok === true, 'normalize: https poster or none allowed');
    assert(S.normalize({ date: '2026-12-25', title: 'T', venue: 'V', tag: 'Anything goes' }).data.tag === 'Anything goes', 'normalize: free-text tag kept');

    // uploaded posters (PNG/JPEG/PDF) — shared viewer on every page
    const P = 'content/posters/items/';
    assert(S.hasPoster({ posterUrl: '/images/posters/p.png' }) && S.hasPoster({ posterUrl: '', posterFile: { type: 'application/pdf', name: 'p.pdf' } }) && !S.hasPoster({ posterUrl: '', posterFile: null }), 'hasPoster: link or uploaded file');
    assert(S.posterKind({ posterUrl: 'https://x.org/p.PDF' }) === 'pdf' && S.posterKind({ posterUrl: '/images/posters/p.jpg' }) === 'image' && S.posterKind({ posterUrl: '', posterFile: { type: 'application/pdf' } }) === 'pdf' && S.posterKind({ posterUrl: '', posterFile: { type: 'image/png' } }) === 'image' && S.posterKind({}) === '', 'posterKind: .pdf link or uploaded PDF → pdf, otherwise image');
    db = fakeDb({ [K + 'f1']: { band: band, date: '2026-12-01', title: 'With file', venue: 'V', posterUrl: '', posterFile: { type: 'application/pdf', name: 'gala.pdf', size: 5 } },
                  [K + 'f2']: { band: band, date: '2026-12-02', title: 'Bad file', venue: 'V', posterFile: { type: 'text/html', name: 'x.html' } },
                  [P + 'f1']: { band: band, fileType: 'application/pdf', fileName: 'gala.pdf', fileData: 'JVBERi0xLjQ=' },
                  [P + 'f2']: { band: band, fileType: 'text/html', fileName: 'x.html', fileData: 'PHNjcmlwdD4=' } });
    items = await S.load(db, band);
    assert(items[0].posterFile && items[0].posterFile.type === 'application/pdf' && items[0].posterFile.name === 'gala.pdf' && items[1].posterFile === null, 'load: uploaded poster note kept, unknown type dropped');
    let pf = await S.loadPoster(db, 'f1');
    assert(pf && pf.type === 'application/pdf' && pf.data === 'JVBERi0xLjQ=' && pf.name === 'gala.pdf', 'loadPoster: returns the uploaded file');
    assert(await S.loadPoster(db, 'f2') === null && await S.loadPoster(db, 'missing') === null && await S.loadPoster({ collection: () => { throw new Error('x'); } }, 'f1') === null, 'loadPoster: wrong type, missing or broken db → null');
    function fakeDoc() { const els = {}; ['poster-modal', 'poster-modal-img', 'poster-modal-title', 'poster-modal-pdf'].forEach(id => els[id] = { id, style: {}, src: '', textContent: '', innerHTML: '' }); return { els, getElementById: id => els[id] || null }; }
    let dom = fakeDoc(), shown = await S.openPoster(dom, db, items[0]);
    assert(shown === true && dom.els['poster-modal'].style.display === 'flex' && /<iframe [^>]*src="(blob:|data:application\/pdf)/.test(dom.els['poster-modal-pdf'].innerHTML) && /Open the PDF/.test(dom.els['poster-modal-pdf'].innerHTML) && dom.els['poster-modal-img'].style.display === 'none' && dom.els['poster-modal-title'].textContent === 'With file', 'openPoster: uploaded PDF shown in the PDF frame, image hidden');
    dom = fakeDoc(); shown = await S.openPoster(dom, db, { title: 'Img', posterUrl: '/images/posters/p.png' });
    assert(shown === true && dom.els['poster-modal-img'].src === '/images/posters/p.png' && dom.els['poster-modal-img'].style.display !== 'none' && dom.els['poster-modal-pdf'].style.display === 'none', 'openPoster: image link shown as an image');
    dom = fakeDoc(); shown = await S.openPoster(dom, db, { title: 'Linked PDF', posterUrl: 'https://x.org/p.pdf' });
    assert(shown === true && /src="https:\/\/x\.org\/p\.pdf"/.test(dom.els['poster-modal-pdf'].innerHTML), 'openPoster: pasted PDF link shown in the PDF frame');
    dom = fakeDoc(); shown = await S.openPoster(dom, db, { id: 'missing', title: 'Gone', posterUrl: '', posterFile: { type: 'image/png', name: 'g.png' } });
    assert(shown === false && /could not be loaded/i.test(dom.els['poster-modal-pdf'].innerHTML) && dom.els['poster-modal'].style.display === 'flex', 'openPoster: missing file → apology, no crash');
    S.closePoster(dom);
    assert(dom.els['poster-modal'].style.display === 'none' && dom.els['poster-modal-img'].src === '' && dom.els['poster-modal-pdf'].innerHTML === '', 'closePoster clears the image and the PDF frame');

    if (band !== 'smb') continue;
    const A = S.admin; assert(A && typeof A.save === 'function', 'admin concert functions on SMB page'); if (!A) continue;
    db = fakeDb({});
    let r = await A.save(db, null, 'scb', { date: 'bad', title: 'T', venue: 'V' }, 'TS');
    assert(r.result === 'invalid' && Object.keys(db.docs).length === 0, 'save: invalid → nothing written');
    r = await A.save(db, null, 'scb', { date: '2026-12-14', title: 'Legion', venue: 'Branch 69', time: '2:00 PM', tag: 'Admission by Donation', featured: true, posterUrl: '' }, 'TS');
    const k = Object.keys(db.docs)[0];
    assert(r.result === 'saved' && db.docs[k].band === 'scb' && db.docs[k].featured === true && db.docs[k].createdAt === 'TS', 'save: new concert written with band + createdAt');
    r = await A.save(db, k.split('/').pop(), 'scb', { date: '2026-12-15', title: 'Legion 2', venue: 'Branch 69' }, 'TS');
    assert(r.result === 'saved' && db.docs[k].title === 'Legion 2' && db.docs[k].date === '2026-12-15' && db.docs[k].band === 'scb', 'save: edit updates in place, band kept');
    r = await A.save(db, null, 'nope', { date: '2026-12-15', title: 'T', venue: 'V' }, 'TS'); assert(r.result === 'invalid', 'save: unknown band refused');
    r = await A.remove(db, k.split('/').pop()); assert(r.result === 'deleted' && !db.docs[k], 'remove deletes');

    // uploading a poster file from the Admin tab
    db = fakeDb({});
    const pdf = { name: 'gala<x>.pdf', type: 'application/pdf', data: 'JVBERi0xLjQ=' };
    r = await A.save(db, null, 'smb', { date: '2026-12-20', title: 'Gala', venue: 'Imperial', posterUrl: 'https://x.org/old.jpg', posterFile: pdf }, 'TS');
    let ck = Object.keys(db.docs).find(x => x.startsWith(K)), cid = ck.split('/').pop();
    assert(r.result === 'saved' && db.docs[ck].posterFile && db.docs[ck].posterFile.type === 'application/pdf' && db.docs[ck].posterFile.size === 8 && !('fileData' in db.docs[ck].posterFile) && db.docs[ck].posterUrl === '' &&
           db.docs[P + cid] && db.docs[P + cid].fileData === 'JVBERi0xLjQ=' && db.docs[P + cid].band === 'smb' && db.docs[P + cid].fileName === 'galax.pdf', 'save: PDF poster stored in its own record, concert carries only the note');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterUrl: '' }, 'TS');
    assert(r.result === 'saved' && db.docs[ck].posterFile && db.docs[ck].posterFile.type === 'application/pdf' && db.docs[P + cid], 'save: editing without a new file keeps the poster');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', removePosterFile: true }, 'TS');
    assert(r.result === 'saved' && !db.docs[ck].posterFile && !db.docs[P + cid], 'save: removePosterFile clears the note and deletes the file');
    let before = JSON.stringify(db.docs);
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'big.pdf', type: 'application/pdf', data: 'A'.repeat(7_200_000) } }, 'TS');
    assert(r.result === 'invalid' && /5 MB/.test(r.message) && JSON.stringify(db.docs) === before, 'save: poster over the limit refused, nothing written');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'x.gif', type: 'image/gif', data: 'R0lGOD' } }, 'TS');
    assert(r.result === 'invalid' && /PNG, JPEG or PDF/.test(r.message) && JSON.stringify(db.docs) === before, 'save: wrong poster type refused');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'empty.pdf', type: 'application/pdf', data: '' } }, 'TS');
    assert(r.result === 'invalid' && JSON.stringify(db.docs) === before, 'save: empty poster file refused');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'p.png', type: 'image/png', data: 'iVBORw0KGgo=' } }, 'TS');
    assert(r.result === 'saved' && db.docs[ck].posterFile.type === 'image/png' && db.docs[P + cid].fileType === 'image/png', 'save: PNG poster accepted');
    // a 3 MB PDF: split across records, every record under 1 MiB, shown whole, replaced cleanly
    const F = window.smbFiles, threeMB = 'QUJD'.repeat(1_000_000);
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'big.pdf', type: 'application/pdf', data: threeMB } }, 'TS');
    let partKeys = Object.keys(db.docs).filter(x => x.startsWith(P + cid + '-p-'));
    assert(r.result === 'saved' && db.docs[P + cid].fileParts === partKeys.length + 1 && partKeys.length >= 4 && [P + cid].concat(partKeys).every(x => JSON.stringify(db.docs[x]).length < 1048576) && db.docs[ck].posterFile.size === 3_000_000, 'save: 3 MB PDF split across records, each under 1 MiB');
    pf = await S.loadPoster(db, cid);
    assert(pf && pf.data === threeMB, 'loadPoster: multi-record PDF read back whole');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'p.png', type: 'image/png', data: 'iVBORw0KGgo=' } }, 'TS');
    assert(r.result === 'saved' && Object.keys(db.docs).filter(x => x.startsWith(P + cid + '-p-')).length === 0 && (await S.loadPoster(db, cid)).data === 'iVBORw0KGgo=', 'save: replacing a big poster removes its old pieces');
    r = await A.save(db, cid, 'smb', { date: '2026-12-21', title: 'Gala 2', venue: 'Imperial', posterFile: { name: 'big.pdf', type: 'application/pdf', data: threeMB } }, 'TS');
    r = await A.remove(db, cid);
    assert(r.result === 'deleted' && !db.docs[ck] && !db.docs[P + cid] && Object.keys(db.docs).filter(x => x.startsWith(P + cid)).length === 0, 'remove: deleting a concert deletes its poster file');
    // the poster write fails (e.g. rules not published yet): concert saved, no dangling note, clear message
    db = fakeDb({}); const realColl = db.collection;
    db.collection = c => { const co = realColl(c); return { doc: id => { const d = co.doc(id); const real = d.collection; d.collection = sub => { const sc = real(sub); if (id === 'posters') sc.doc = () => ({ set: () => Promise.reject(new Error('denied')), get: () => Promise.reject(new Error('denied')), delete: () => Promise.reject(new Error('denied')) }); return sc; }; return d; } }; };
    r = await A.save(db, null, 'smb', { date: '2026-12-20', title: 'Gala', venue: 'Imperial', posterFile: pdf }, 'TS');
    ck = Object.keys(db.docs).find(x => x.startsWith(K));
    assert(r.result === 'error' && /poster/i.test(r.message) && ck && !db.docs[ck].posterFile, 'save: poster upload failure reported, concert has no dangling note');

    // seeding from today's JSON files, only for bands with no concerts yet
    const files = { '/data/concerts.json': { concerts: [{ id: 'x', date: '2026-04-09', title: 'Rebirth', venue: 'HVHS', time: '7:00 PM', posterUrl: '/images/posters/poster-concert-2.jpg' }] },
                    '/second-chance/data/concerts.json': { concerts: [{ date: '2026-04-06', title: 'Something Old', venue: 'Legion', time: '7:00 PM', posterUrl: '../images/posters/poster-concert-1.jpg' }] },
                    '/back-in-time/data/concerts.json': { concerts: [{ date: '2026-05-16', title: 'Big Band Benefit', venue: 'Imperial', time: '7:00 PM' }, { date: '2026-07-21', title: 'Parkland', venue: 'PV', time: '6:30 PM' }] } };
    const fetchJson = p => Promise.resolve(files[p]);
    db = fakeDb({ [K + 'have']: { band: 'bit', date: '2026-11-07', title: 'RMS', venue: 'RMS', time: '7 PM' } });
    r = await A.seedFromJson(db, fetchJson, 'TS');
    const all = Object.values(db.docs);
    assert(r.result === 'seeded' && all.filter(d => d.band === 'smb').length === 1 && all.filter(d => d.band === 'scb').length === 1 && all.filter(d => d.band === 'bit').length === 1, 'seed: fills SMB + 2CB from files, leaves BIT (already has concerts) alone');
    assert(all.find(d => d.band === 'scb').posterUrl === '/images/posters/poster-concert-1.jpg' && all.find(d => d.band === 'smb').createdAt === 'TS', 'seed: poster path normalised, createdAt set');
    r = await A.seedFromJson(db, () => Promise.reject(new Error('404')), 'TS'); assert(r.result === 'error' || r.result === 'seeded', 'seed: unreadable file does not throw');
  }
  console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`);
  process.exit(failures ? 1 : 0);
})();
