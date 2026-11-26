/* Checks the Discovery Timeline: every find has a found date and a headline,
 * and both the timeline page and the home page render them from
 * data/discovery-timeline.json.
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
            if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('not found'); }
            rsp.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(f).pipe(rsp);
        });
        srv.listen(0, '127.0.0.1', () => res(srv));
    });
}

const failures = [];
const check = (cond, m, detail) => { if (cond) console.log('  ok   ' + m); else { failures.push(m + (detail ? ': ' + detail : '')); console.log('  FAIL ' + m + (detail ? ': ' + detail : '')); } };

(async () => {
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

    const built = path.join(DIST, 'data/discovery-timeline.json');
    check(fs.existsSync(built), 'the built site includes data/discovery-timeline.json');
    check(fs.existsSync(path.join(DIST, 'discovery.html')), 'the built site includes discovery.html');

    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.goto(base + 'discovery.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('[data-find-id]').length > 0);
    const timeline = await page.evaluate(() => Array.from(document.querySelectorAll('[data-find-id]')).map(el => ({
        id: el.getAttribute('data-find-id'),
        text: el.innerText
    })));
    check(!errs.length, 'discovery page has no errors', errs.join(' | '));
    check(timeline.length === finds.length, 'the timeline renders every find (' + finds.length + ')', 'rendered ' + timeline.length);
    finds.forEach(f => {
        const el = timeline.find(t => t.id === f.id);
        check(!!el, 'timeline shows ' + f.id);
        if (el) {
            check(el.text.includes(f.headline), 'timeline headline is visible for ' + f.id);
            check(/Found /i.test(el.text), 'timeline shows a found date for ' + f.id, el.text.slice(0, 80));
        }
    });

    errs.length = 0;
    await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
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

    await browser.close();
    srv.close();
    console.log(failures.length ? '\n' + failures.length + ' problem(s) found.' : '\nAll checks passed.');
    process.exit(failures.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
