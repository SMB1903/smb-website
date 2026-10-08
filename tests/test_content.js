// Delivery 1: admin-editable announcements / band hall / executives. Drives the smbContent block (shared by
// all three pages) with a fake Firestore; the rules and real rendering are David's live test.
const fs = require('fs'), path = require('path');
const PAGES = [['index.html', 'smb'], ['second-chance/index.html', 'scb'], ['back-in-time/index.html', 'bit']];
let failures = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { failures++; console.log('  FAIL: ' + m); } }
function T(ms) { return { toDate: () => new Date(ms), toMillis: () => ms }; }
function fakeDb(initial) {
  const docs = Object.assign({}, initial), log = []; let seq = 0;
  function snap(keys) { const arr = keys.sort().map(k => ({ id: k.split('/').pop(), data: () => docs[k], ref: { delete() { log.push('delete ' + k); delete docs[k]; return Promise.resolve(); } } })); return { forEach: f => arr.forEach(f), docs: arr, size: arr.length, empty: arr.length === 0 }; }
  function coll(prefix) {
    return {
      get() { log.push('list ' + prefix); return Promise.resolve(snap(Object.keys(docs).filter(k => k.startsWith(prefix + '/') && k.split('/').length === prefix.split('/').length + 1))); },
      where(field, op, val) { return { get() { log.push('where ' + prefix + ' ' + field); return Promise.resolve(snap(Object.keys(docs).filter(k => { if (!k.startsWith(prefix + '/')) return false; const d = docs[k]; const v = field.split('.').reduce((o, p) => (o || {})[p], d); return v === val; }))); } }; },
      add(d) { const id = 'gen' + (++seq); docs[prefix + '/' + id] = d; log.push('add ' + prefix + '/' + id); return Promise.resolve({ id }); },
      doc(id) { const k = prefix + '/' + id; return {
        get() { return Promise.resolve({ exists: !!docs[k], id, data: () => docs[k] }); },
        set(d, o) { log.push('set ' + k); docs[k] = (o && o.merge) ? Object.assign({}, docs[k] || {}, d) : d; return Promise.resolve(); },
        update(d) { log.push('update ' + k); if (!docs[k]) return Promise.reject(new Error('nf')); Object.assign(docs[k], d); return Promise.resolve(); },
        delete() { log.push('delete ' + k); delete docs[k]; return Promise.resolve(); },
        collection(sub) { return coll(k + '/' + sub); } }; } };
  }
  return { docs, log, collection: c => coll(c) };
}
(async () => {
  for (const [page, band] of PAGES) {
    console.log(page);
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const m = html.match(/\/\/ ── PORTAL CONTENT ──[\s\S]*?\/\/ ── END PORTAL CONTENT ──/);
    assert(m, 'PORTAL CONTENT block present'); if (!m) continue;
    const window = {}; new Function('window', m[0])(window);
    const C = window.smbContent; assert(C && typeof C.loadAnnouncements === 'function', 'smbContent defined'); if (!C) continue;
    const NOW = 1_800_000_000_000, DAY = 86_400_000;

    // ── announcements: per-band filter, newest first, escaped ──
    let db = fakeDb({
      'content/announcements/items/a1': { title: 'For SMB <b>only</b>', body: 'x', date: T(NOW - DAY), bands: { smb: true, scb: false, bit: false } },
      'content/announcements/items/a2': { title: 'For everyone', body: 'Line1\nLine2', date: T(NOW), bands: { smb: true, scb: true, bit: true } },
      'content/announcements/items/a3': { title: 'For 2CB', body: 'y', date: T(NOW - 2 * DAY), bands: { smb: false, scb: true, bit: false } } });
    let items = await C.loadAnnouncements(db, band);
    const titles = items.map(i => i.title);
    assert(titles[0] === 'For everyone', 'newest first');
    if (band === 'smb') assert(titles.join('|') === 'For everyone|For SMB <b>only</b>', 'SMB sees its own + everyone, not 2CB-only');
    if (band === 'scb') assert(titles.join('|') === 'For everyone|For 2CB', '2CB sees its own + everyone, not SMB-only');
    if (band === 'bit') assert(titles.join('|') === 'For everyone', 'BIT sees only everyone');
    const h = C.announcementsHtml(items);
    assert(h.includes('&lt;b&gt;only&lt;/b&gt;') || band !== 'smb', 'announcement title escaped');
    assert(/Line1<br>Line2/.test(h), 'body line breaks become <br>');
    assert(C.announcementsHtml([]) === '', 'empty list → empty string (fallback stays visible)');
    assert(/class="portal-card save-the-date"/.test(C.announcementsHtml([{ title: 'Save the Date — Events', body: '', date: null }])) && !/save-the-date/.test(C.announcementsHtml([{ title: 'Other', body: '', date: null }])), 'a Save the Date announcement gets the emphasised style');

    // ── band hall: doc or null; https-only link; escaped ──
    db = fakeDb({ 'content/bandhall': { heading: 'Band Hall <Cleaning>', text: 'Rota', linkLabel: 'View', linkUrl: 'javascript:alert(1)' } });
    let bh = await C.loadBandHall(db); assert(bh && bh.heading === 'Band Hall <Cleaning>', 'band hall doc loaded');
    let bhh = C.bandHallHtml(bh);
    assert(bhh.includes('&lt;Cleaning&gt;') && !/javascript:/.test(bhh) && !/<a /.test(bhh), 'band hall escaped and non-https link not rendered as a link');
    bhh = C.bandHallHtml({ heading: 'H', text: 'T', linkLabel: 'PDF', linkUrl: 'https://example.com/x.pdf' });
    assert(/href="https:\/\/example\.com\/x\.pdf"/.test(bhh) && /PDF/.test(bhh), 'https link rendered');
    assert((await C.loadBandHall(fakeDb({}))) === null, 'missing doc → null (fallback stays)');
    // attachment rendering (delivery 3)
    const PNG = 'iVBORw0KGgo=', PDF = 'JVBERi0xLjQ=';
    bhh = C.bandHallHtml({ heading: 'H', fileName: 'rota.png', fileType: 'image/png', fileData: PNG });
    assert(/<img [^>]*src="data:image\/png;base64,iVBORw0KGgo="/.test(bhh), 'PNG attachment rendered inline as an image');
    bhh = C.bandHallHtml({ heading: 'H', fileName: 'rota.pdf', fileType: 'application/pdf', fileData: PDF });
    assert(/<a [^>]*href="data:application\/pdf;base64,JVBERi0xLjQ="[^>]*download="rota\.pdf"/.test(bhh) && !/<img/.test(bhh), 'PDF attachment rendered as a download link');
    bhh = C.bandHallHtml({ heading: 'H', fileName: 'x.svg', fileType: 'image/svg+xml', fileData: 'PHN2Zz4=' });
    assert(!/data:/.test(bhh), 'disallowed attachment type never rendered');
    bhh = C.bandHallHtml({ heading: 'H', fileName: '"><script>', fileType: 'image/png', fileData: 'abc<>' });
    assert(!/<script>/.test(bhh) && !/data:[^"]*</.test(bhh), 'attachment name and data are escaped/sanitised');

    // ── executives: ordered, escaped ──
    db = fakeDb({ 'content/executives/items/e2': { name: 'B <i>', role: 'Treasurer', order: 2 }, 'content/executives/items/e1': { name: 'A', role: 'President', order: 1 } });
    let ex = await C.loadExecutives(db);
    assert(ex.map(e => e.name).join(',') === 'A,B <i>', 'executives sorted by order');
    assert(C.executivesHtml(ex).includes('B &lt;i&gt;') && C.executivesHtml([]) === '', 'executives escaped; empty → empty string');

    // ── read denied (rules not yet published) → empty/null, no throw ──
    const denied = { collection: () => ({ where: () => ({ get: () => Promise.reject(new Error('permission-denied')) }), get: () => Promise.reject(new Error('permission-denied')), doc: () => ({ get: () => Promise.reject(new Error('permission-denied')) }) }) };
    assert((await C.loadAnnouncements(denied, band)).length === 0 && (await C.loadBandHall(denied)) === null && (await C.loadExecutives(denied)).length === 0, 'denied reads → empty, no throw');

    if (band !== 'smb') continue;
    // ── admin side (index.html only): validation + writes ──
    const A = C.admin; assert(A && typeof A.saveAnnouncement === 'function', 'admin content functions on SMB page'); if (!A) continue;
    db = fakeDb({});
    let r = await A.saveAnnouncement(db, null, { title: '', body: '', bands: { smb: true } }, 'TS');
    assert(r.result === 'invalid' && Object.keys(db.docs).length === 0, 'announcement needs a title or body');
    r = await A.saveAnnouncement(db, null, { title: 'Hi', body: '', bands: {} }, 'TS');
    assert(r.result === 'invalid', 'announcement needs at least one band');
    r = await A.saveAnnouncement(db, null, { title: ' Hi ', body: 'B', date: new Date(NOW), bands: { smb: true, scb: 'yes' } }, 'TS');
    const k = Object.keys(db.docs)[0];
    assert(r.result === 'saved' && k.startsWith('content/announcements/items/') && db.docs[k].title === 'Hi' && db.docs[k].bands.smb === true && db.docs[k].bands.scb === false && db.docs[k].createdAt === 'TS', 'new announcement written with strict band flags');
    r = await A.saveAnnouncement(db, k.split('/').pop(), { title: 'Hi2', body: 'B', bands: { bit: true } }, 'TS');
    assert(r.result === 'saved' && db.docs[k].title === 'Hi2' && db.docs[k].bands.bit === true && db.docs[k].bands.smb === false, 'edit updates the same document');
    r = await A.deleteAnnouncement(db, k.split('/').pop()); assert(r.result === 'deleted' && !db.docs[k], 'delete removes it');
    r = await A.saveBandHall(db, { heading: 'H', text: 'T', linkLabel: 'L', linkUrl: 'http://insecure' });
    assert(r.result === 'invalid', 'band hall link must be https');
    r = await A.saveBandHall(db, { heading: 'H', text: 'T', linkLabel: 'L', linkUrl: '' });
    assert(r.result === 'saved' && db.docs['content/bandhall'].heading === 'H', 'band hall saved (text only allowed)');
    // attachments (delivery 3)
    const big = 'A'.repeat(1_300_000);   // > 900 KB decoded
    r = await A.saveBandHall(db, { heading: 'H', file: { name: 'big.png', type: 'image/png', data: big } });
    assert(r.result === 'invalid' && /900 KB|too (big|large)/i.test(r.message), 'attachment over the limit refused');
    r = await A.saveBandHall(db, { heading: 'H', file: { name: 'x.gif', type: 'image/gif', data: 'R0lGODlh' } });
    assert(r.result === 'invalid', 'disallowed type refused');
    r = await A.saveBandHall(db, { heading: 'H', text: 'T', file: { name: 'rota.png', type: 'image/png', data: 'iVBORw0KGgo=' } });
    let doc = db.docs['content/bandhall'];
    assert(r.result === 'saved' && doc.fileName === 'rota.png' && doc.fileType === 'image/png' && doc.fileData === 'iVBORw0KGgo=' && doc.fileSize === 8 && doc.heading === 'H', 'attachment saved with name/type/data/size');
    r = await A.saveBandHall(db, { heading: 'H2', text: 'T2', linkUrl: '' });
    doc = db.docs['content/bandhall'];
    assert(r.result === 'saved' && doc.heading === 'H2' && doc.fileData === 'iVBORw0KGgo=', 'saving text keeps the existing attachment');
    r = await A.saveBandHall(db, { heading: 'H3', removeFile: true });
    doc = db.docs['content/bandhall'];
    assert(r.result === 'saved' && !doc.fileData && !doc.fileName && doc.heading === 'H3', 'removeFile clears the attachment');
    r = await A.saveBandHall(db, { heading: 'H', file: { name: 'rota.pdf', type: 'application/pdf', data: 'JVBERi0xLjQ=' } });
    assert(r.result === 'saved' && db.docs['content/bandhall'].fileType === 'application/pdf', 'PDF attachment accepted');
    r = await A.saveExecutive(db, null, { name: '', role: 'x' }); assert(r.result === 'invalid', 'executive needs a name');
    r = await A.saveExecutive(db, null, { name: 'A', role: 'President' }); r = await A.saveExecutive(db, null, { name: 'B', role: 'VP' }); r = await A.saveExecutive(db, null, { name: 'C', role: 'Sec' });
    let list = await C.loadExecutives(db); assert(list.map(e => e.name).join('') === 'ABC', 'executives appended in order');
    r = await A.moveExecutive(db, list[2].id, -1); list = await C.loadExecutives(db); assert(list.map(e => e.name).join('') === 'ACB', 'move up swaps with the previous');
    r = await A.moveExecutive(db, list[0].id, -1); list = await C.loadExecutives(db); assert(r.result === 'noop' && list.map(e => e.name).join('') === 'ACB', 'move up at top is a no-op');
    r = await A.moveExecutive(db, list[2].id, 1); assert(r.result === 'noop', 'move down at bottom is a no-op');
    r = await A.deleteExecutive(db, list[1].id); list = await C.loadExecutives(db); assert(list.map(e => e.name).join('') === 'AB', 'delete executive');
    // starter content: only fills EMPTY sections
    db = fakeDb({ 'content/executives/items/x': { name: 'Keep', role: 'r', order: 1 } });
    r = await A.seedDefaults(db, 'TS');
    const annCount = Object.keys(db.docs).filter(x => x.startsWith('content/announcements/items/')).length, exCount = Object.keys(db.docs).filter(x => x.startsWith('content/executives/items/')).length;
    assert(r.result === 'seeded' && annCount === 2 && db.docs['content/bandhall'] && exCount === 1 && db.docs['content/executives/items/x'], 'seed fills empty announcements + band hall, leaves non-empty executives alone');
    const seeded = Object.values(db.docs).filter(d => d.title);
    assert(seeded.some(d => /Save the Date/i.test(d.title)) && seeded.some(d => /rehearsal/i.test(d.title + d.body)), 'seeded announcements are today\'s two notes');
    assert(/BandHall_CleaningSchedule\.pdf/.test(db.docs['content/bandhall'].linkUrl), 'seeded band hall keeps today\'s PDF');
    assert(seeded.every(d => d.bands && (d.bands.smb || d.bands.scb || d.bands.bit)), 'seeded announcements target bands');
  }
  console.log(failures ? `FAIL (${failures} of ${checks} checks)` : `OK — ${checks} checks`);
  process.exit(failures ? 1 : 0);
})();
