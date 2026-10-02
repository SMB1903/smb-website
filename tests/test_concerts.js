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
    const window = {}; new Function('window', m[0])(window);
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
