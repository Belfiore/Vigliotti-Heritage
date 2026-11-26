/* Checks the family map against data/places.json and data/people.json.
 *
 * Living people must not appear on the map. Every published place with events
 * and coordinates must be drawn. The map and any CSV export come from the same
 * places file.
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.pbf': 'application/octet-stream' };

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
const check = (cond, m, detail) => { if (cond) console.log('  ok   ' + m); else { failures.push(m + (detail ? ': ' + detail : '')); console.log('  FAIL ' + m + (detail ? ': ' + detail : '')); } };

(async () => {
    const people = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/people.json'))).people;
    const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/places.json'))).places;
    const living = new Set(people.filter(p => p.isLiving).map(p => p.id));
    const src = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sources.json'))).sources.map(s => s.id));

    check(!/[\u2013\u2014]/.test(JSON.stringify(places)), 'no em or en dashes in places.json');
    check(places.every(p => p.lat != null && p.lng != null), 'every place has coordinates', places.filter(p => p.lat == null || p.lng == null).map(p => p.id).join(', '));

    const livingEv = [];
    places.forEach(p => (p.events || []).forEach(e => (e.personIds || []).forEach(id => {
        if (living.has(id)) livingEv.push(p.id + ':' + id);
    })));
    check(!livingEv.length, 'living people are not named on any map event', livingEv.join(', '));

    const livingPlaceIds = [];
    people.filter(p => p.isLiving).forEach(p => {
        const ids = JSON.stringify(p).match(/"placeId":"[^"]+"/g) || [];
        if (ids.length) livingPlaceIds.push(p.id + ' ' + ids.join(', '));
    });
    check(!livingPlaceIds.length, 'living people have no placeId fields', livingPlaceIds.join('; '));

    const dangling = [];
    const walk = (o, who) => {
        if (Array.isArray(o)) o.forEach(x => walk(x, who));
        else if (o && typeof o === 'object') {
            for (const k of Object.keys(o)) {
                if (k === 'placeId' && o[k] && !places.some(pl => pl.id === o[k])) dangling.push(who + ' -> ' + o[k]);
                walk(o[k], who);
            }
        }
    };
    people.forEach(p => walk(p, p.id));
    check(!dangling.length, 'every placeId in people.json exists in places.json', dangling.join('; '));

    const badSrc = [];
    places.forEach(p => (p.events || []).forEach(e => {
        if (!(e.sourceIds || []).length) badSrc.push(e.id + ' none');
        (e.sourceIds || []).forEach(s => { if (!src.has(s)) badSrc.push(e.id + ' ' + s); });
    }));
    check(!badSrc.length, 'every place event cites a known source', badSrc.join(', '));

    const master = path.join(ROOT, 'data/exports/places-master.csv');
    check(fs.existsSync(master), 'an exported map CSV exists at data/exports/places-master.csv');
    if (fs.existsSync(master)) {
        const lines = fs.readFileSync(master, 'utf8').trim().split('\n');
        const eventCount = places.reduce((n, p) => n + (p.events || []).length, 0);
        check(lines.length - 1 === eventCount, 'the master CSV has one row per place event (' + eventCount + ')', 'csv rows ' + (lines.length - 1));
    }

    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + 'map.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.FM && (FM.ready || (FM.DATA && FM.DATA.events)));
    await page.waitForTimeout(1500);
    check(!errs.length, 'map page has no errors', errs.join(' | '));

    const st = await page.evaluate(() => {
        const D = FM.DATA;
        return {
            events: D.events.length,
            placed: [...new Set(D.events.map(e => e.placeId))],
            people: [...new Set([].concat(...D.events.map(e => e.personIds || [])))],
        };
    });
    const drawable = places.filter(p => (p.events || []).length).map(p => p.id);
    const notDrawn = drawable.filter(id => !st.placed.includes(id));
    check(!notDrawn.length, 'every place with events is on the map (' + st.placed.length + ' places, ' + st.events + ' events)', notDrawn.join(', '));
    const livingOnMap = st.people.filter(id => living.has(id));
    check(!livingOnMap.length, 'the built map names no living people', livingOnMap.join(', '));

    await page.goto(base + 'map.html?place=gate-of-heaven-hawthorne', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.FM && FM.ready);
    await page.waitForFunction(() => document.querySelector('article.pn[data-place="gate-of-heaven-hawthorne"]'));
    const panel = await page.evaluate(() => {
        const art = document.querySelector('article.pn[data-place="gate-of-heaven-hawthorne"]');
        const p = document.getElementById('panel');
        return { shown: p ? !p.hidden : !!art, text: (art || p || document.body).innerText };
    });
    check(/Gate of Heaven/i.test(panel.text), 'the cemetery place opens from the URL', (panel.text || '').slice(0, 160));

    await browser.close();
    srv.close();
    console.log(failures.length ? '\n' + failures.length + ' problem(s) found.' : '\nAll checks passed.');
    process.exit(failures.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
