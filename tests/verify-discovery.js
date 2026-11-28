/* Checks the Discoveries page and the Key Discoveries on the home page:
 * every find has a found date and a headline, the engine page renders them,
 * and the home page still reads data/discovery-timeline.json.
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
    return new Promise(res => {
        const srv = http.createServer((req, rsp) => {
            let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const f = path.join(DIST, p);
            if (!f.startsWith(DIST) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); return rsp.end('not found'); }
            rsp.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(f).pipe(rsp);
        });
        srv.listen(0, '127.0.0.1', () => res(srv));
    });
}

async function pastVisitor(page) {
    const skip = page.locator('.fv-quiet');
    try {
        await skip.first().waitFor({ state: 'visible', timeout: 4000 });
        await skip.first().click();
    } catch (e) { /* the visitor question is already answered, or it is off */ }
}

const failures = [];
const check = (cond, m, detail) => { if (cond) console.log('  ok   ' + m); else { failures.push(m + (detail ? ': ' + detail : '')); console.log('  FAIL ' + m + (detail ? ': ' + detail : '')); } };

(async () => {
    const notesPath = path.join(ROOT, 'data/discoveries.json');
    const notesDoc = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    const notes = notesDoc.discoveries || [];
    check(notes.length > 0, 'data/discoveries.json has at least one note');
    check(!/[\u2013\u2014]/.test(JSON.stringify(notesDoc)), 'no em or en dashes in discoveries.json');
    notes.forEach(f => {
        const id = f.id || 'note';
        check(!!f.found && /^\d{4}-\d{2}-\d{2}$/.test(f.found), id + ' has a found date', f.found);
        check(!!f.headline, id + ' has a headline');
    });

    const srcPath = path.join(ROOT, 'data/discovery-timeline.json');
    const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    const finds = data.finds || [];
    check(finds.length > 0, 'the discovery timeline has at least one find');
    check(!/[\u2013\u2014]/.test(JSON.stringify(data)), 'no em or en dashes in discovery-timeline.json');
    finds.forEach(f => {
        check(!!f.id, 'find has an id', JSON.stringify(f));
        check(!!f.foundDate && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(f.foundDate), (f.id || 'find') + ' has a foundDate', f.foundDate);
        check(!!f.headline, (f.id || 'find') + ' has a headline');
    });

    const builtTimeline = path.join(DIST, 'data/discovery-timeline.json');
    check(fs.existsSync(builtTimeline), 'the built site includes data/discovery-timeline.json');
    check(!fs.existsSync(path.join(DIST, 'data/discoveries.json')), 'data/discoveries.json is not published as-is');
    check(fs.existsSync(path.join(DIST, 'discoveries.html')), 'the built site includes discoveries.html');
    check(fs.existsSync(path.join(DIST, 'discovery.html')), 'the built site keeps discovery.html as a pointer for older links');
    check(fs.existsSync(path.join(DIST, 'discoveries/history.json')), 'the built site includes discoveries/history.json');
    check(fs.existsSync(path.join(DIST, 'discoveries/state.json')), 'the built site includes discoveries/state.json');

    const history = JSON.parse(fs.readFileSync(path.join(DIST, 'discoveries/history.json'), 'utf8'));
    const entries = history.entries || [];
    check(entries.length > 0, 'history.json has at least one published find');
    notes.forEach(f => {
        const el = entries.find(e => e.headline === f.headline);
        check(!!el, 'history includes the headline for ' + (f.id || 'note'));
        if (el) check(el.found === f.found, 'history found date matches for ' + (f.id || 'note'), el.found);
    });

    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.goto(base + 'discoveries.html', { waitUntil: 'networkidle' });
    await pastVisitor(page);
    await page.waitForSelector('.tl-card, .tl-day');
    // Busy days fold after a few cards; open every "show more" so all headlines can be read.
    const mores = page.locator('.tl-more');
    const moreCount = await mores.count();
    for (let i = 0; i < moreCount; i++) {
        const btn = mores.nth(i);
        if (await btn.isVisible()) await btn.click();
    }
    const rendered = await page.evaluate(() => {
        const days = Array.from(document.querySelectorAll('.tl-day')).map(d => d.getAttribute('data-date'));
        const cards = Array.from(document.querySelectorAll('.tl-card')).map(c => ({
            id: c.id,
            headline: (c.querySelector('.tl-headline') || {}).innerText || '',
            text: c.innerText,
            date: (c.closest('.tl-day') || {}).getAttribute && (c.closest('.tl-day').getAttribute('data-date'))
        }));
        const nav = Array.from(document.querySelectorAll('.main-nav a')).map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() }));
        return { days, cards, nav, title: document.title };
    });
    check(!errs.length, 'discoveries page has no errors', errs.join(' | '));
    check(rendered.nav.some(a => /discoveries\.html$/i.test(a.href || '') && /Discoveries/i.test(a.text)), 'the nav includes Discoveries');
    check(!rendered.nav.some(a => (a.href || '').includes('discovery.html')), 'the nav does not also link to the old Discovery Timeline page');
    notes.forEach(f => {
        const el = rendered.cards.find(c => (c.headline || '').includes(f.headline));
        check(!!el, 'discoveries page shows ' + (f.id || 'note'));
        if (el) check(el.date === f.found, 'discoveries page dates ' + (f.id || 'note') + ' on ' + f.found, el.date);
    });
    check(rendered.days.includes('2026-11-26'), 'the page groups finds under 26 November 2026');
    const confCount = await page.locator('.tl-conf').count();
    check(confCount === 0, 'confidence labels stay off the discoveries page', String(confCount));

    errs.length = 0;
    await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
    await pastVisitor(page);
    await page.waitForFunction(() => document.querySelectorAll('#discoveryHome [data-find-id]').length > 0);
    const home = await page.evaluate(() => Array.from(document.querySelectorAll('#discoveryHome [data-find-id]')).map(el => ({
        id: el.getAttribute('data-find-id'),
        text: el.innerText
    })));
    check(!errs.length, 'home page has no errors', errs.join(' | '));
    check(home.length > 0, 'the home page renders key discoveries');
    home.forEach(el => {
        check(/Found /i.test(el.text), 'home card shows a found date for ' + el.id);
        check(!!el.text.trim(), 'home card has a headline for ' + el.id);
    });
    const homeLink = await page.evaluate(() => {
        const a = document.querySelector('a[href="discoveries.html"]');
        return a ? a.textContent.trim() : '';
    });
    check(!!homeLink, 'the home page links to discoveries.html');

    await browser.close();
    srv.close();
    console.log(failures.length ? '\n' + failures.length + ' problem(s) found.' : '\nAll checks passed.');
    process.exit(failures.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
