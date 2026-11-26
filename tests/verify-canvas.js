/* Checks the interactive tree against data/people.json.
 *
 *   python3 path/to/family-site-engine/build/build_site.py --site . --out _site
 *   node tests/verify-canvas.js
 *   DIST=path/to/build node tests/verify-canvas.js
 *   SHOTS=1 node tests/verify-canvas.js
 *
 * Every person in data/people.json must be a card. Living people must not show
 * dates or addresses on a card or in a profile. Parent, child and spouse links
 * must agree, and a child must sit below their parents.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.resolve(process.env.DIST || path.join(ROOT, '_site'));
if (!fs.existsSync(path.join(DIST, 'engine-build.json'))) {
    console.error('No built site at ' + DIST + '. Build it first, or set DIST.');
    process.exit(2);
}
const SHOTS = process.env.SHOTS ? path.join(__dirname, 'screenshots') : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pbf': 'application/octet-stream' };

function serve() {
    return new Promise(res => {
        const srv = http.createServer((req, rsp) => {
            let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const f = path.join(DIST, p);
            if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('not found'); }
            rsp.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(f).pipe(rsp);
        });
        srv.listen(0, '127.0.0.1', () => res(srv));
    });
}

const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));

const HELD_BACK = /Phoenixville|Rowayton|Pottersville|10532|Stevens Avenue/i;
const YEARISH = /\b(19|20)\d{2}\b/;

(async () => {
    const people = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/people.json'))).people;
    const byId = Object.fromEntries(people.map(p => [p.id, p]));
    ok(people.length + ' people in the data');

    for (const p of people) {
        const blob = JSON.stringify(p);
        if (/\u2014|\u2013/.test(blob)) fail(p.id + ' has an em or en dash in the record');
        if (p.isLiving && HELD_BACK.test(blob)) fail(p.id + ' is living but a held-back place appears in the record');
        if (p.isLiving && (p.birth || p.death || p.burial || (p.residences && p.residences.length))) {
            fail(p.id + ' is living but has dates or residences in the record');
        }
        for (const id of p.parents || []) {
            if (!byId[id]) fail(p.id + ' parent ' + id + ' is missing');
            else if (!(byId[id].children || []).includes(p.id)) fail(p.id + ' is not listed among ' + id + "'s children");
        }
        for (const id of p.children || []) {
            if (!byId[id]) fail(p.id + ' child ' + id + ' is missing');
            else if (!(byId[id].parents || []).includes(p.id)) fail(p.id + ' is not listed among ' + id + "'s parents");
        }
        for (const s of p.spouses || []) {
            if (!byId[s.id]) fail(p.id + ' spouse ' + s.id + ' is missing');
            else if (!(byId[s.id].spouses || []).some(x => x.id === p.id)) fail(p.id + ' is not listed among ' + s.id + "'s spouses");
        }
    }
    if (!failures.length) ok('parent, child and spouse links agree both ways');

    const want = people.map(p => p.id).sort();
    const living = people.filter(p => p.isLiving).map(p => p.id);

    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const browser = await chromium.launch();
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

    for (const [w, h, name] of [[1280, 800, 'desktop'], [768, 1024, 'tablet'], [390, 844, 'phone']]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        await page.goto(base + 'tree-canvas.html', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__tree && document.querySelectorAll('.card').length > 0);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        if (errs.length) fail(w + 'px: page errors: ' + errs.join(' | ')); else ok(w + 'px: no page errors');

        const report = await page.evaluate((livingIds) => {
            const t = window.__tree;
            const cards = Array.from(document.querySelectorAll('.card')).map(c => c.dataset.id);
            const livingDates = [];
            document.querySelectorAll('.card').forEach(c => {
                if (!livingIds.includes(c.dataset.id)) return;
                const text = (c.innerText || c.textContent || '');
                if (/\b(19|20)\d{2}\b/.test(text)) livingDates.push(c.dataset.id + ' card: ' + text.replace(/\s+/g, ' ').slice(0, 120));
            });
            const pos = t.L.pos;
            const by = {};
            t.D.people.forEach(p => { by[p.id] = p; });
            const geom = [];
            Object.keys(pos).forEach(id => {
                const p = by[id], q = pos[id];
                if (!p || !q) { geom.push(id + ' has no card position'); return; }
                (p.parents || []).forEach(pid => {
                    const pq = pos[pid];
                    if (pq && !(q.y > pq.y + 20)) geom.push(id + ' is not below parent ' + pid);
                });
                (p.spouses || []).forEach(s => {
                    const sq = pos[s.id];
                    if (sq && Math.abs(q.y - sq.y) > 8) geom.push(id + ' is not on the same row as spouse ' + s.id);
                });
            });
            const ids = Object.keys(pos);
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const a = pos[ids[i]], b = pos[ids[j]];
                    const ox = Math.min(a.x + t.CW, b.x + t.CW) - Math.max(a.x, b.x);
                    const oy = Math.min(a.y + t.CH, b.y + t.CH) - Math.max(a.y, b.y);
                    if (ox > 2 && oy > 2) geom.push(ids[i] + ' overlaps ' + ids[j]);
                }
            }
            return { cards, livingDates, geom, n: cards.length };
        }, living);

        if (report.n !== want.length) fail(w + 'px: ' + report.n + ' cards, expected ' + want.length);
        else ok(w + 'px: all ' + report.n + ' people are on the canvas');
        const missing = want.filter(id => !report.cards.includes(id));
        if (missing.length) fail(w + 'px: missing cards: ' + missing.join(', '));
        if (report.livingDates.length) report.livingDates.forEach(m => fail(w + 'px living date on card: ' + m));
        else ok(w + 'px: living cards show no years');
        if (w === 1280) {
            if (report.geom.length) report.geom.forEach(g => fail('layout: ' + g));
            else ok('every child is below their parents, couples share a row, and no cards overlap');
        }

        await page.goto(base + 'tree-canvas.html#/person/dylan-vigliotti', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__tree && document.body.innerText.includes('Dylan Vigliotti'));
        const profile = await page.evaluate(() => document.body.innerText);
        if (YEARISH.test(profile) && /Phoenixville|Rowayton/.test(profile)) fail(w + 'px: Dylan profile shows a held-back place');
        if (HELD_BACK.test(profile)) fail(w + 'px: Dylan profile shows a held-back place');
        // The profile page may mention research dates in chrome; check the panel if present.
        const panelText = await page.evaluate(() => {
            const p = document.querySelector('.panel, #panel, .person-panel, .pc-panel, aside');
            return p ? p.innerText : '';
        });
        if (panelText && HELD_BACK.test(panelText)) fail(w + 'px: person panel shows a held-back place');

        if (SHOTS) {
            await page.goto(base + 'tree-canvas.html', { waitUntil: 'networkidle' });
            await page.waitForFunction(() => window.__tree && document.querySelectorAll('.card').length > 0);
            await page.evaluate(() => window.__tree.fitView && window.__tree.fitView());
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(SHOTS, 'tree-' + name + '-' + w + '.png') });
        }
        await ctx.close();
    }

    await browser.close();
    srv.close();
    console.log(failures.length ? '\n' + failures.length + ' problem(s) found.' : '\nAll checks passed.');
    process.exit(failures.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
