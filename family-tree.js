// Family Tree list view. Reads data/people.json, the same file that drives the Family Canvas.
(function () {
    'use strict';

    var root = document.getElementById('treeRoot');
    var sidebar = document.getElementById('bioSidebar');
    var bio = document.getElementById('bioContent');
    var byId = {}, meta = {}, people = [];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function initial(p) { return (p.givenNames || p.displayName || '?').trim().charAt(0).toUpperCase(); }
    function cardType(p) {
        if (p.id === meta.rootPersonId) return 'you';
        if (p.isDirectLine) return 'direct';
        return 'sibling';
    }
    function personHTML(p) {
        return '<div class="tree-person" tabindex="0" role="button" data-id="' + esc(p.id) + '" data-side="' + (p.isDirectLine ? 'direct' : 'other') + '" data-type="' + cardType(p) + '">' +
            '<div class="person-avatar' + (p.sex === 'F' ? ' female' : '') + '">' + esc(initial(p)) + '</div>' +
            '<div class="person-info"><h4>' + esc(p.displayName) + '</h4><span class="person-subtitle">' + esc(p.disambiguator || '') + '</span></div></div>';
    }
    function marriageLabel(a, bId) {
        var rec = (a.spouses || []).filter(function (s) { return s.id === bId; })[0];
        var yr = rec && rec.marriageDate ? String(rec.marriageDate).slice(0, 4) : '';
        return yr ? 'married ' + yr : 'married';
    }

    function render() {
        var gens = (meta.generations || []).slice().sort(function (a, b) { return a.generation - b.generation; });
        var html = '';
        gens.forEach(function (g, gi) {
            var inGen = people.filter(function (p) { return p.generation === g.generation; });
            if (!inGen.length) return;
            var done = {}, rows = '', singles = '';
            inGen.forEach(function (p) {
                if (done[p.id]) return;
                var partner = (p.spouses || []).map(function (s) { return byId[s.id]; }).filter(function (q) { return q && q.generation === p.generation && !done[q.id]; })[0];
                done[p.id] = true;
                if (partner) {
                    done[partner.id] = true;
                    rows += '<div class="couple-row">' + personHTML(p) + '<span class="couple-connector">' + esc(marriageLabel(p, partner.id)) + '</span>' + personHTML(partner) + '</div>';
                } else {
                    singles += personHTML(p);
                }
            });
            if (singles) rows += '<div class="gen-people">' + singles + '</div>';
            html += (gi ? '<div class="gen-connector">&#9661;</div>' : '') +
                '<div class="tree-generation"><div class="gen-label">Generation ' + esc(g.label) + ' &mdash; ' + esc(g.title) + '</div>' +
                (g.range ? '<div class="gen-subtitle">' + esc(g.range) + '</div>' : '') + rows + '</div>';
        });
        root.innerHTML = html;
        Array.prototype.forEach.call(root.querySelectorAll('.tree-generation'), function (el, i) {
            setTimeout(function () { el.classList.add('visible'); }, i * 120);
        });
        root.addEventListener('click', onPick);
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { var c = e.target.closest('.tree-person'); if (c) { e.preventDefault(); show(c.dataset.id); } }
        });
    }
    function onPick(e) { var c = e.target.closest('.tree-person'); if (c) show(c.dataset.id); }

    function names(ids) { return (ids || []).map(function (id) { return byId[id] ? byId[id].displayName : ''; }).filter(Boolean).join(', '); }
    function siblings(p) {
        var set = {};
        (p.parents || []).forEach(function (pid) { (byId[pid].children || []).forEach(function (c) { if (c !== p.id) set[c] = true; }); });
        return Object.keys(set);
    }
    function row(label, value) {
        return value ? '<div class="bio-detail-row"><span class="bio-detail-label">' + esc(label) + '</span><span class="bio-detail-value">' + esc(value) + '</span></div>' : '';
    }

    function show(id) {
        var p = byId[id]; if (!p) return;
        Array.prototype.forEach.call(root.querySelectorAll('.tree-person'), function (n) { n.classList.toggle('active', n.dataset.id === id); });
        var gen = (meta.generations || []).filter(function (g) { return g.generation === p.generation; })[0];
        var tags = [];
        if (gen) tags.push('Generation ' + gen.label);
        if (p.isDirectLine) tags.push(meta.directLineLabel || 'Direct line');
        if (p.isLiving) tags.push('Living');
        var details = row('Parents', names(p.parents)) +
            row('Spouse', names((p.spouses || []).map(function (s) { return s.id; }))) +
            row('Siblings', names(siblings(p))) +
            row('Children', names(p.children));
        bio.innerHTML =
            '<h3 class="bio-name">' + esc(p.displayName) + '</h3>' +
            '<p class="bio-subtitle">' + esc(p.disambiguator || '') + '</p>' +
            '<div class="bio-tags">' + tags.map(function (t) { return '<span class="bio-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
            '<p class="bio-description">' + esc(p.summary || '') + '</p>' +
            (details ? '<div class="bio-details">' + details + '</div>' : '') +
            '<div class="bio-links"><h4>Full profile</h4><a class="bio-link" href="tree-canvas.html#/person/' + encodeURIComponent(p.id) + '"><span class="bio-link-label">Open on the Family Canvas</span> &rarr;</a></div>';
        if (window.innerWidth <= 768) {
            sidebar.classList.add('has-bio');
            requestAnimationFrame(function () { requestAnimationFrame(function () { sidebar.classList.add('open'); }); });
            var ov = document.getElementById('sidebarOverlay'); if (ov) ov.classList.add('active');
        }
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        var ov = document.getElementById('sidebarOverlay'); if (ov) ov.classList.remove('active');
        setTimeout(function () { if (!sidebar.classList.contains('open')) sidebar.classList.remove('has-bio'); }, 320);
    }
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

    // filter
    document.getElementById('treeFilter').addEventListener('click', function (e) {
        var b = e.target.closest('.tree-btn'); if (!b) return;
        Array.prototype.forEach.call(this.querySelectorAll('.tree-btn'), function (x) { x.classList.toggle('active', x === b); });
        var view = b.dataset.view;
        Array.prototype.forEach.call(root.querySelectorAll('.tree-person'), function (n) {
            var on = view === 'full' || n.dataset.side === view;
            n.style.opacity = on ? '1' : '0.2';
            n.style.transform = on ? 'scale(1)' : 'scale(0.95)';
        });
    });

    fetch('data/people.json').then(function (r) { return r.json(); }).then(function (d) {
        meta = d.meta; people = d.people;
        people.forEach(function (p) { byId[p.id] = p; });
        render();
    }).catch(function (e) {
        root.innerHTML = '<p class="placeholder-text">The family data could not be loaded (' + esc(e.message) + '). Serve the site over http, not file://.</p>';
    });
})();
